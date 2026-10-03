import { expect, test, type Locator, type Page } from '@playwright/test';
import { serveFixture } from './helpers/fixture-server';

const url = serveFixture('pos');

test.beforeEach(async ({ page }) => {
  await page.goto(url());
  await page.waitForFunction(() => (window as any).posFixture);
  await expect(page.getByText('No items yet')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

// Below 768px POS has its phone layout (mobile-pos.spec.ts).
const narrowest = 768;

const dialogs = [
  ['PriceList', 'Price list'],
  ['CouponCode', 'Coupon code'],
  ['ItemEnquiry', 'Item enquiry'],
  ['LoyaltyProgram', 'Redeem loyalty points'],
  ['BatchSelection', 'Select batch'],
  ['SavedInvoice', 'Invoices'],
  ['ReturnSalesInvoice', 'Return an invoice'],
  ['Payment', 'Payment'],
  ['ShiftClose', 'Close POS shift'],
];
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
  { width: narrowest, height: 560 },
]) {
  test(`dialogs keep titles and actions visible at ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const [name, title] of dialogs) {
      await showModal(page, name);
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('footer')).toBeInViewport();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${name}.png`),
      });
      await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
    await page.evaluate(() => (window as any).posFixture.closeShift());
    const opening = page.getByRole('dialog', {
      name: 'Open POS shift',
      exact: true,
    });
    await expect(opening).toBeVisible();
    await expect(
      opening.getByRole('button', { name: 'Open shift', exact: true })
    ).toBeInViewport();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('OpenShift.png'),
    });
  });
}

test('price list and loyalty shortcuts follow their own features', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { fyo, fillCart } = (window as any).posFixture;
    Object.assign(fyo.singles.AccountingSettings, { enable_price_list: false });
    fillCart();
  });

  await page.keyboard.press('Shift+P');
  await page.keyboard.press('Shift+L');

  await expect(
    page.getByRole('dialog', { name: 'Redeem loyalty points', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Price list', exact: true })
  ).toBeHidden();
});

test('leaving a sale with items asks to save or discard it', async ({
  page,
}) => {
  await page.evaluate(() => {
    const fixture = (window as any).posFixture;
    fixture.fillCart();
    void fixture.pos.routeToSinvList();
  });

  const dialog = page.getByRole('dialog', { name: 'Leave this sale?' });
  for (const name of ['Cancel', 'Discard and Continue', 'Save and Continue']) {
    await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('discarding a sale on leaving empties the cart', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = (window as any).posFixture;
    fixture.fillCart();
    void fixture.pos.routeToSinvList();
  });
  const dialog = page.getByRole('dialog', { name: 'Leave this sale?' });
  await dialog
    .getByRole('button', { name: 'Discard and Continue', exact: true })
    .click();

  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).posFixture.pos.sinvDoc.items?.length ?? 0
      )
    )
    .toBe(0);
});

test('a coupon a preview takes off is named in a warning', async ({ page }) => {
  await page.evaluate(() => {
    const { state } = (window as any).posFixture;
    state.invoice.push('coupons', { coupons: 'FOSSCLUB' });
  });
  await expect(
    page.getByRole('button', { name: '1 coupon applied', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    const { invoice } = (window as any).posFixture.state;
    const document = invoice.getMethodDocument({ keepRowNames: true });
    invoice.applyPreview(invoice.toDocValues({ ...document, coupons: [] }));
  });
  await expect(
    page.getByText('Coupon FOSSCLUB no longer applies, so it was removed.')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Coupon', exact: true })
  ).toBeVisible();
});

test('Done keeps the applied coupons after a refused code', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { fillCart, state } = (window as any).posFixture;
    fillCart();
    state.invoice.push('coupons', { coupons: 'FOSSCLUB' });
  });
  await page
    .getByRole('button', { name: '1 coupon applied', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Coupon code', exact: true });
  await dialog.getByRole('combobox').fill('EXPIRED');
  await page.getByRole('option', { name: 'EXPIRED', exact: true }).click();
  await expect(dialog).toContainText('Coupon EXPIRED has expired.');

  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: '1 coupon applied', exact: true })
  ).toBeVisible();
});

test('a long price list name wraps instead of leaving the cart', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { state } = (window as any).posFixture;
    state.invoice.price_list = 'Partner Price List 2026-27 for Resellers';
  });
  const cart = page.getByRole('complementary', { name: 'Cart' });
  const priceList = cart.getByRole('button', { name: /Partner Price List/ });
  const cartBox = (await cart.boundingBox())!;
  const buttonBox = (await priceList.boundingBox())!;
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    cartBox.x + cartBox.width
  );
});

test('a held sale reopens as saved after its cart was edited', async ({
  page,
}) => {
  const removeItem = page.getByRole('button', { name: 'Remove item' });
  const openHeldSale = async () => {
    await page.getByRole('button', { name: 'Held', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Invoices', exact: true });
    await dialog.getByRole('row', { name: /SINV-2026-HELD/ }).click();
    await dialog.getByRole('button', { name: 'Open invoice' }).click();
    await expect(dialog).toBeHidden();
  };

  await openHeldSale();
  await removeItem.click();
  await expect(page.getByText('No items yet')).toBeVisible();
  await openHeldSale();
  await expect(removeItem).toHaveCount(1);
});

test('a submitted invoice from Held offers only its payment', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).posFixture.pos.selectedInvoiceName({
      name: 'SINV-2026-0002',
      docstatus: 1,
    })
  );
  const dialog = page.getByRole('dialog', { name: 'Payment' });
  await expect(dialog.getByRole('button', { name: 'Pay', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Submit unpaid' })).toHaveCount(0);
});

test('a submitted invoice in the cart offers nothing that changes its totals', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).posFixture.openSavedInvoice(1));
  const cart = page.getByRole('complementary', { name: 'Cart' });
  await expect(cart.getByRole('button', { name: /^Pay / })).toBeVisible();
  for (const name of [
    'Coupon',
    'Loyalty',
    'Price list',
    'Hold',
    'Increase quantity',
    'Decrease quantity',
    'Remove item',
  ]) {
    await expect(cart.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(cart.getByRole('combobox')).toHaveCount(0);

  await cart.getByRole('button', { name: /^Organic Assam Tea/ }).click();
  await expect(
    cart.getByRole('textbox', { name: 'Quantity', exact: true })
  ).toBeDisabled();
  await expect(cart.getByText('Tap a number to use the keypad.')).toBeHidden();
  for (const key of ['Shift+C', 'Shift+L', 'Shift+P']) {
    await page.keyboard.press(key);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('cart values fit and expanded item fields open a usable keypad', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => (window as any).posFixture.fillCart());
  const rows = page.getByRole('list', { name: 'Cart' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    for (const value of await row.locator('span.tabular-nums.truncate').all()) {
      expect(
        await value.evaluate((el) => el.scrollWidth <= el.clientWidth)
      ).toBe(true);
    }
  }
  await page.getByRole('button', { name: /^Organic Assam Tea/ }).click();
  await expect(rows.first()).toHaveClass(/bg-surface-gray-1/);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('modern-expanded.png'),
  });
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).click();
  const keypad = page.getByRole('dialog', { name: 'Quantity', exact: true });
  await expect(keypad).toBeVisible();
  await expect(keypad).toContainText('Organic Assam Tea');
  await page.setViewportSize({ width: narrowest, height: 560 });
  await expect(
    keypad.getByRole('button', { name: 'Save', exact: true })
  ).toBeInViewport();
  await keypad
    .getByRole('textbox', { name: 'Quantity', exact: true })
    .fill('-1');
  await keypad.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(keypad).toContainText('cannot be negative');
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('keypad-validation.png'),
  });
  await keypad.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(keypad).toBeHidden();
});

test('a cart row in boxes shows and takes its rate per box', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).posFixture.fillBoxRow());
  const row = page.getByRole('list', { name: 'Cart' }).getByRole('listitem');
  await expect(row).toContainText('3,100.00 each');
  await expect(row).toContainText('18,600.00');

  await row.getByRole('button', { name: /^Organic Assam Tea/ }).click();
  await page.getByRole('textbox', { name: 'Rate', exact: true }).click();
  const keypad = page.getByRole('dialog', { name: 'Rate', exact: true });
  await keypad.getByRole('textbox', { name: 'Rate', exact: true }).fill('3000');
  await keypad.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(keypad).toBeHidden();
  // The server's preview sets the rate per stock unit from the rate per box.
  const sent = await page.evaluate(() => {
    const { invoice } = (window as any).posFixture.state;
    const [row] = invoice.getMethodDocument({
      keepRowNames: true,
      clearServerFilled: true,
    }).items;
    return {
      hasRate: 'rate' in row,
      transferRate: Number(row.transfer_rate),
      isManualRate: invoice.items[0].is_manual_rate,
    };
  });
  expect(sent).toEqual({
    hasRate: false,
    transferRate: 3000,
    isManualRate: true,
  });
});

test('the transfer quantity keypad is titled as its cart field', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).posFixture.fillBoxRow());
  await page.getByRole('button', { name: /^Organic Assam Tea/ }).click();
  await page
    .getByRole('textbox', { name: 'Transfer Quantity', exact: true })
    .click();

  await expect(
    page.getByRole('dialog', { name: 'Transfer Quantity', exact: true })
  ).toBeVisible();
});

for (const modern of [true, false]) {
  test(`${modern ? 'Modern' : 'Classic'} cart rows step quantities and edit ${modern ? 'with the keypad' : 'inline'}`, async ({
    page,
  }) => {
    await page.evaluate((modern) => {
      const fixture = (window as any).posFixture;
      fixture.setLayout(modern);
      fixture.fillCart();
    }, modern);
    const row = page
      .getByRole('list', { name: 'Cart' })
      .getByRole('listitem')
      .first();
    const remove = row.getByRole('button', { name: 'Remove item', exact: true });
    await expect(
      row.getByRole('button', { name: 'Increase quantity', exact: true })
    ).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Decrease quantity', exact: true })
    ).toBeVisible();

    const bounds = await row.boundingBox();
    await remove.hover();
    await expect(
      page.locator('[data-slot="bubble"]', { hasText: 'Remove item' })
    ).toBeVisible();
    expect(await row.boundingBox()).toEqual(bounds);

    await row.getByRole('button', { name: /^Organic Assam Tea/ }).click();
    await expect(
      row.getByRole('button', { name: /^Organic Assam Tea/ })
    ).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('textbox', { name: 'Quantity', exact: true })
      .click();
    const keypad = page.getByRole('dialog', { name: 'Quantity', exact: true });
    if (modern) {
      await expect(keypad).toBeVisible();
    } else {
      await expect(keypad).toBeHidden();
    }
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`${modern ? 'modern' : 'classic'}-row.png`),
    });
  });
}

test('view toggles survive switching layouts and checkout remains reachable', async ({
  page,
}) => {
  const grid = page.getByRole('radio', { name: 'Grid view', exact: true });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('item-grid.png'),
  });
  await page.evaluate(() => (window as any).posFixture.setLayout(false));
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await page.setViewportSize({ width: narrowest, height: 700 });
  await page
    .getByRole('button', { name: 'Add Organic Assam Tea', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('item-grid-small.png'),
  });
  await page.getByRole('radio', { name: 'List view', exact: true }).click();
  await page.evaluate(() => (window as any).posFixture.fillCart());
  for (const modern of [true, false]) {
    await page.evaluate(
      (modern) => (window as any).posFixture.setLayout(modern),
      modern
    );
    await page.setViewportSize({ width: narrowest, height: 700 });
    const pay = page.getByRole('button', { name: 'Pay 2,250.00', exact: true });
    await pay.scrollIntoViewIfNeeded();
    await expect(pay).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(narrowest);
    await page.screenshot({
      animations: 'disabled',
      path: test
        .info()
        .outputPath(modern ? 'modern-small.png' : 'classic-small.png'),
    });
  }
});

test('invoice selection and bank payment fields work in a small dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: narrowest, height: 560 });
  await showModal(page, 'ReturnSalesInvoice');
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Search by invoice name' })
    .fill('0001');
  await expect(dialog.getByRole('row', { name: /0001/ })).toHaveCount(1);
  await dialog.getByRole('row', { name: /0001/ }).click();
  await expect(
    dialog.getByRole('button', { name: 'Create return' })
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await showModal(page, 'Payment');
  await dialog
    .getByRole('radio', { name: 'Bank Transfer', exact: true })
    .click();
  await expect(dialog.getByRole('textbox', { name: /Ref\./ })).toBeVisible();
  await dialog.getByRole('textbox', { name: /Ref\./ }).fill('BANK-006');
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('bank-payment-small.png'),
  });
  await page.evaluate(() => {
    (window as any).posFixture.state.invoice.return_against = 'SINV-2026-0001';
    document.documentElement.dataset.theme = 'dark';
  });
  await expect(page.getByRole('dialog', { name: 'Refund' })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Refund and print', exact: true })
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('refund-dark.png'),
  });
});

test('payment takes a large amount field, tiles and same-size actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1352, height: 848 });
  await showModal(page, 'Payment');
  const dialog = page.getByRole('dialog', { name: 'Payment' });
  const amount = dialog.getByRole('textbox', { name: 'Amount paid' });
  await expect(amount).toHaveCSS('height', '40px');
  for (const button of await dialog.locator('footer button').all()) {
    await expect(button).toHaveCSS('font-size', '14px');
    await expect(button).toHaveCSS('height', '32px');
  }
  const methods = dialog.getByRole('radio');
  await expect(methods).toHaveCount(5);
  for (const method of await methods.all()) {
    await expect(method).toHaveCSS('height', '64px');
  }
  await dialog.getByRole('radio', { name: 'Cash', exact: true }).click();
  await dialog.getByRole('button', { name: '2,300.00', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Change to return');
  await expect(dialog.getByRole('status')).toContainText('50.00');
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('payment-compact.png'),
  });
});

test('the paid amount takes arithmetic, and text that is no number pays nothing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await showModal(page, 'Payment');
  const amount = page
    .getByRole('dialog', { name: 'Payment' })
    .getByRole('textbox', { name: 'Amount paid' });
  await amount.fill('2000+300');
  await amount.press('Tab');
  await expect(amount).toHaveValue('2,300.00');
  // Desk keeps the formatted amount while it is edited.
  await amount.focus();
  await expect(amount).toHaveValue('2,300.00');
  await amount.fill('abc');
  await amount.press('Tab');
  await expect(amount).toHaveValue('0.00');
  expect(errors).toEqual([]);
});

async function showModal(page: Page, name: string) {
  await page.evaluate((name) => {
    const fixture = (window as any).posFixture;
    if (name === 'Payment' && !fixture.state.invoice.items?.length)
      fixture.fillCart();
    fixture.showModal(name);
  }, name);
}

for (const dark of [false, true]) {
  test(`link actions share their size and hover styling in ${dark ? 'dark' : 'light'} mode`, async ({ page }) => {
    await page.evaluate((dark) => {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    }, dark);
    const clear = page.getByRole('button', { name: 'Clear value', exact: true }).first();
    const linked = page.getByRole('button', { name: 'Open linked entry', exact: true }).first();
    const options = clear.locator('..').getByRole('button', { name: 'Open options', exact: true });
    const preview = page.locator('[data-slot="content"]').filter({
      has: page.getByText('Party', { exact: true }),
    });

    const normal = await actionStyle(clear);
    expect(await actionStyle(linked)).toEqual(normal);
    expect(await actionStyle(options)).toEqual(normal);
    await clear.hover();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('clear-hover.png') });
    const hovered = await actionStyle(clear);
    expect(hovered.backgroundColor).not.toBe(normal.backgroundColor);
    await linked.hover();
    await expect(preview).toBeVisible();
    await expect.poll(() => actionStyle(linked)).toEqual(hovered);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('linked-hover.png') });
    await options.hover();
    await expect.poll(() => actionStyle(options)).toEqual(hovered);
    await expect(preview).toBeHidden();

    // Opening a preview must still work from the keyboard without changing the link.
    await linked.focus();
    await expect(preview).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(options).toBeFocused();
    await expect(preview).toBeHidden();
    await options.click();
    await expect(page.getByRole('option', { name: 'Aarav Shah', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await clear.click();
    await expect(clear).toBeHidden();
    await page.getByRole('option', { name: 'Aarav Shah', exact: true }).click();
    await expect(clear).toBeVisible();
    expect(await page.evaluate(() => (window as any).posFixture.state.invoice.party)).toBe('Aarav Shah');
    await linked.click();
    await expect(page).toHaveURL(/\/edit\/Party\/Aarav%20Shah/);
  });
}

for (const size of ['large', 'small']) {
  test(`${size} link actions have equal top and bottom insets`, async ({
    page,
  }) => {
    for (const dir of ['ltr', 'rtl']) {
      for (const showLabel of [false, true]) {
        for (const showClearButton of [false, true]) {
          await page.evaluate(
            (props) => {
              document.documentElement.dir = props.dir;
              (window as any).posFixture.state.linkControl = props;
            },
            { size, showLabel, showClearButton, dir }
          );
          const options = page.getByRole('button', {
            name: 'Open options',
            exact: true,
          });
          const control = options.locator('..').locator('..');
          await options.hover();
          const bounds = (await control.boundingBox())!;
          const button = (await options.boundingBox())!;
          const top = button.y - bounds.y;
          const bottom = bounds.y + bounds.height - button.y - button.height;
          const end =
            dir === 'ltr'
              ? bounds.x + bounds.width - button.x - button.width
              : button.x - bounds.x;
          expect(button.width).toBe(24);
          expect(button.height).toBe(24);
          expect(top).toBe(size === 'large' ? 4 : 2);
          expect(bottom).toBe(top);
          expect(end).toBe(top);
          const linked = control.getByRole('button', {
            name: 'Open linked entry',
            exact: true,
          });
          const linkedBounds = (await linked.boundingBox())!;
          expect(linkedBounds.y).toBe(button.y);
          const gap =
            dir === 'ltr'
              ? button.x - linkedBounds.x - linkedBounds.width
              : linkedBounds.x - button.x - button.width;
          expect(gap).toBe(2);
          if (showLabel && !showClearButton) {
            await page.screenshot({
              animations: 'disabled',
              path: test.info().outputPath(`${dir}-hover.png`),
            });
          }
        }
      }
    }
    await page
      .getByRole('button', { name: 'Open options', exact: true })
      .click();
    await page.getByRole('option', { name: 'Aarav Shah', exact: true }).click();
    await expect(page.getByRole('combobox')).toHaveValue('Aarav Shah');
  });
}

for (const size of ['large', 'small']) {
  test(`${size} read-only link actions have balanced hover spacing`, async ({
    page,
  }) => {
    for (const dir of ['ltr', 'rtl']) {
      for (const showLabel of [false, true]) {
        for (const border of [false, true]) {
          await page.evaluate(
            (props) => {
              document.documentElement.dir = props.dir;
              (window as any).posFixture.state.linkControl = props;
            },
            { size, dir, showLabel, border, readOnly: true }
          );
          const input = page.getByRole('textbox');
          const linked = page.getByRole('button', {
            name: 'Open linked entry',
            exact: true,
          });
          await expect(input).toBeDisabled();
          await expect(linked).toBeEnabled();
          await linked.hover();
          const field = (await input.boundingBox())!;
          const button = (await linked.boundingBox())!;
          const top = button.y - field.y;
          const bottom = field.y + field.height - button.y - button.height;
          const end =
            dir === 'ltr'
              ? field.x + field.width - button.x - button.width
              : button.x - field.x;
          expect(button.width).toBe(24);
          expect(button.height).toBe(24);
          expect(top).toBe(size === 'large' ? 4 : 2);
          expect(bottom).toBe(top);
          expect(end).toBe(top);
          if (!showLabel && !border) {
            await expect(
              page.getByText('Party', { exact: true })
            ).toBeVisible();
            await page.screenshot({
              animations: 'disabled',
              path: test.info().outputPath(`${dir}-readonly-hover.png`),
            });
          }
        }
      }
    }
    expect(
      await page.evaluate(() => (window as any).posFixture.state.invoice.party)
    ).toBe('Aarav Shah');
    const linked = page.getByRole('button', {
      name: 'Open linked entry',
      exact: true,
    });
    await linked.focus();
    await expect(page.getByText('Party', { exact: true })).toBeVisible();
    await linked.press('Enter');
    await expect(page).toHaveURL(/\/edit\/Party\/Aarav%20Shah/);
    await expect(page.getByText('Party', { exact: true })).toBeHidden();
  });
}

async function actionStyle(button: Locator) {
  return button.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished)
    );
    const style = getComputedStyle(element);
    return {
      width: style.width,
      height: style.height,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });
}
