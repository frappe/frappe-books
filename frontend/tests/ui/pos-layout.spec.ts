import { expect, test, type Locator, type Page } from '@playwright/test';
import { serveFixture } from './helpers/fixture-server';

const url = serveFixture('pos');

test.beforeEach(async ({ page }) => {
  await page.goto(url());
  await page.waitForFunction(() => (window as any).posFixture);
  await expect(page.getByText('No items in this sale')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

// Below 768px POS has its phone layout (mobile-pos.spec.ts).
const narrowest = 768;

const dialogs = [
  ['PriceList', 'Apply Price List'],
  ['CouponCode', 'Apply Coupon Code'],
  ['ItemEnquiry', 'Item Enquiry'],
  ['LoyaltyProgram', 'Redeem Loyalty Points'],
  ['BatchSelection', 'Select Batch'],
  ['SavedInvoice', 'Saved and Submitted Invoices'],
  ['ReturnSalesInvoice', 'Return Sales Invoice'],
  ['Payment', 'Complete payment'],
  ['ShiftClose', 'Close POS Shift'],
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
      name: 'Open POS Shift',
      exact: true,
    });
    await expect(opening).toBeVisible();
    await expect(
      opening.getByRole('button', { name: 'Open Shift', exact: true })
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
    page.getByRole('dialog', { name: 'Redeem Loyalty Points', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Apply Price List', exact: true })
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

test('a held sale reopens as saved after its cart was edited', async ({
  page,
}) => {
  const removeItem = page.getByRole('button', { name: 'Remove item' });
  const openHeldSale = async () => {
    await page.getByRole('button', { name: 'Held', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Saved and Submitted Invoices',
    });
    await dialog.getByRole('row', { name: /SINV-2026-HELD/ }).click();
    await dialog.getByRole('button', { name: 'Open Invoice' }).click();
    await expect(dialog).toBeHidden();
  };

  await openHeldSale();
  await removeItem.click();
  await expect(page.getByText('No items in this sale')).toBeVisible();
  await openHeldSale();
  await expect(removeItem).toHaveCount(1);
});

test('cart values fit and expanded item fields open a usable keypad', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => (window as any).posFixture.fillCart());
  const rows = page.locator('[data-slot="list-row"]').filter({
    has: page.getByRole('button', { name: 'Expand item', exact: true }),
  });
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    for (const value of await row.locator('[role="cell"] > span').all()) {
      expect(
        await value.evaluate((el) => el.scrollWidth <= el.clientWidth)
      ).toBe(true);
    }
  }
  await page
    .getByRole('button', { name: 'Expand item', exact: true })
    .first()
    .click();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('modern-expanded.png'),
  });
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).click();
  const keypad = page.getByRole('dialog', {
    name: 'Edit Quantity',
    exact: true,
  });
  await expect(keypad).toBeVisible();
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
  const row = page.locator('[data-slot="list-row"]').filter({
    has: page.getByRole('button', { name: 'Expand item', exact: true }),
  });
  await expect(row).toContainText('6.003,100.0018,600.00');

  await row.getByRole('button', { name: 'Expand item', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Rate', exact: true }).click();
  const keypad = page.getByRole('dialog', { name: 'Edit Rate', exact: true });
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

for (const modern of [true, false]) {
  test(`${modern ? 'Modern' : 'Classic'} cart actions have balanced hover insets`, async ({
    page,
  }) => {
    await page.evaluate((modern) => {
      const fixture = (window as any).posFixture;
      fixture.setLayout(modern);
      fixture.fillCart();
    }, modern);
    const row = page
      .locator('[data-slot="list-row"]')
      .filter({
        has: page.getByRole('button', { name: 'Expand item', exact: true }),
      })
      .first();
    const expand = row.getByRole('button', { name: 'Expand item', exact: true });
    const remove = row.getByRole('button', { name: 'Remove item', exact: true });

    for (const width of [1440, 1024, narrowest]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = (await row.boundingBox())!;
      const leading = (await expand.boundingBox())!;
      const trailing = (await remove.boundingBox())!;
      expect(bounds.height).toBe(48);
      expect(leading.x - bounds.x).toBeCloseTo(8, 0);
      expect(bounds.x + bounds.width - trailing.x - trailing.width).toBeCloseTo(
        8,
        0
      );
      expect(leading.y - bounds.y).toBeCloseTo(12, 0);
      expect(trailing.y - bounds.y).toBeCloseTo(12, 0);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const bounds = await row.boundingBox();
    for (const [name, button] of [
      ['remove', remove],
      ['expand', expand],
    ] as const) {
      await button.hover();
      await expect(
        page.locator('[data-slot="bubble"]', {
          hasText: name === 'remove' ? 'Remove item' : 'Expand item',
        })
      ).toBeVisible();
      expect(await row.boundingBox()).toEqual(bounds);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${name}-hover.png`),
      });
    }
    await expand.click();
    await expect(
      page.getByRole('button', { name: 'Collapse item', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('spinbutton', { name: 'Quantity', exact: true })
    ).toBeVisible();
  });
}

test('view toggles survive switching layouts and checkout remains reachable', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Grid View', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'List View', exact: true })
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('item-grid.png'),
  });
  await page.evaluate(() => (window as any).posFixture.setLayout(false));
  await expect(
    page.getByRole('button', { name: 'List View', exact: true })
  ).toBeVisible();
  await page.setViewportSize({ width: narrowest, height: 700 });
  await page
    .getByRole('button', { name: 'Add Organic Assam Tea', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('item-grid-small.png'),
  });
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await page.evaluate(() => (window as any).posFixture.fillCart());
  for (const modern of [true, false]) {
    await page.evaluate(
      (modern) => (window as any).posFixture.setLayout(modern),
      modern
    );
    await page.setViewportSize({ width: narrowest, height: 700 });
    const pay = page.getByRole('button', { name: 'Pay', exact: true });
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
    dialog.getByRole('button', { name: 'Create Return' })
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
  await expect(
    page.getByRole('dialog', { name: 'Complete refund' })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Refund & print', exact: true })
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('refund-dark.png'),
  });
});

test('payment buttons match the form text scale', async ({ page }) => {
  await page.setViewportSize({ width: 1352, height: 848 });
  await showModal(page, 'Payment');
  const dialog = page.getByRole('dialog', { name: 'Complete payment' });
  const amount = dialog.getByRole('spinbutton', { name: 'Paid amount' });
  const inputFont = await amount.evaluate((el) => getComputedStyle(el).fontSize);
  const inputHeight = await amount.evaluate((el) => getComputedStyle(el).height);
  const methods = dialog.getByRole('radio');
  await expect(methods).toHaveCount(5);
  for (const button of await dialog.locator('footer button').all()) {
    await expect(button).toHaveCSS('font-size', inputFont);
    await expect(button).toHaveCSS('height', inputHeight);
  }
  for (const method of await methods.all()) {
    await expect(method.locator('[data-slot=label]')).toHaveCSS(
      'font-size',
      inputFont
    );
    await expect(method).toHaveCSS('height', inputHeight);
  }
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('payment-compact.png'),
  });
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
