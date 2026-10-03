import { expect, test, type Locator, type Page } from '@playwright/test';
import { serveFixture } from './helpers/fixture-server';

const url = serveFixture('pos');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  await page.goto(url());
  await page.waitForFunction(() => (window as any).posFixture);
  await page.evaluate(() => document.fonts.ready);
});

test('items fill a two-column grid and a tap adds to the cart bar', async ({
  page,
}) => {
  const tiles = page.getByRole('button', { name: /^Add / });
  await expect(tiles).toHaveCount(6);
  const [first, second, third] = await Promise.all(
    [0, 1, 2].map(async (index) => (await tiles.nth(index).boundingBox())!)
  );
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(third.y).toBeGreaterThan(first.y + first.height);
  expect(first.x).toBe(16);
  expect(second.x + second.width).toBe(374);

  const cartBar = page.getByRole('button', { name: /\d+ items?/ });
  await expect(cartBar).toBeHidden();
  const tea = page.getByRole('button', { name: 'Add Organic Assam Tea' });
  await tea.click();
  await expect(tea.getByText('1', { exact: true })).toBeVisible();
  await expect(cartBar).toContainText('1 item');
  await tea.click();
  await expect(tea.getByText('2', { exact: true })).toBeVisible();
  await expect(cartBar).toContainText('2 items');
  expect((await cartBar.boundingBox())!.height).toBe(40);
  await expect(cartBar).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('items.png') });
});

test('the cart stepper turns minus into remove at one', async ({ page }) => {
  const tea = page.getByRole('button', { name: 'Add Organic Assam Tea' });
  await tea.click();
  await tea.click();
  await page.getByRole('button', { name: /2 items/ }).click();
  const cart = page.getByRole('dialog', { name: 'Cart', exact: true });
  const quantity = cart.getByRole('spinbutton', {
    name: 'Quantity of Organic Assam Tea',
  });
  await expect(quantity).toHaveValue('2');
  await expect(cart.getByRole('button', { name: 'Remove' })).toBeHidden();
  await cart.getByRole('button', { name: 'Decrease' }).click();
  await expect(quantity).toHaveValue('1');
  await page.screenshot({ path: test.info().outputPath('cart.png') });

  await cart.getByRole('button', { name: 'Organic Assam Tea' }).click();
  const line = page.getByRole('dialog', { name: 'Organic Assam Tea' });
  await expect(line.getByText('Rate', { exact: true })).toBeVisible();
  await expect(line.getByText('Discount %', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('line.png') });
  await line.getByRole('button', { name: 'Done' }).click();
  await expect(cart).toBeVisible();

  await cart.getByRole('button', { name: 'Remove' }).click();
  await expect(cart).toBeHidden();
  await expect(page.getByRole('button', { name: /\d+ items?/ })).toBeHidden();
});

test('the cart lists every amount between net and grand total', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { fyo, state } = (window as any).posFixture;
    (window as any).posFixture.fillCart();
    state.invoice.total_discount = fyo.pesa(250);
    state.invoice.loyalty_points_amount = fyo.pesa(50);
  });
  await page.getByRole('button', { name: /\d+ items?/ }).click();
  const cart = page.getByRole('dialog', { name: 'Cart', exact: true });
  for (const label of [
    'Net Total',
    'Discount',
    'Loyalty Points Redeemed',
    'Grand Total',
  ]) {
    await expect(cart.getByText(label, { exact: true })).toBeVisible();
  }
});

test('the payment screen explains the amount due', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  await page.getByRole('button', { name: /6 items/ }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  const payment = page.getByRole('heading', { name: 'Payment' });
  await expect(payment).toBeVisible();
  // Nothing changes the net total yet, so the amount due stands alone.
  await expect(page.getByText('Net Total', { exact: true })).toBeHidden();

  await page.evaluate(() => {
    const { fyo, state } = (window as any).posFixture;
    state.invoice.total_discount = fyo.pesa(250);
    state.invoice.loyalty_points_amount = fyo.pesa(50);
  });
  for (const label of ['Net Total', 'Discount', 'Loyalty Points Redeemed']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test('payment methods wrap in a two-column grid', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  await page.getByRole('button', { name: /6 items/ }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();

  const methods = page.getByRole('radio');
  await expect(methods).toHaveCount(5);
  const boxes = await Promise.all(
    (await methods.all()).map(async (method) => (await method.boundingBox())!)
  );
  expect(boxes.every(({ height }) => height === 48)).toBe(true);
  expect(boxes[1].y).toBe(boxes[0].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].x).toBe(boxes[0].x);

  await page.getByRole('radio', { name: 'Cash', exact: true }).click();
  await expect(methods.first()).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '2,300.00' }).click();
  await expect(page.getByRole('status')).toContainText('Change to return');
  await page.screenshot({ path: test.info().outputPath('payment.png') });

  await page.getByRole('radio', { name: 'Bank Transfer' }).click();
  await expect(page.getByRole('textbox', { name: /Ref\./ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pay', exact: true })
  ).toBeDisabled();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /6 items/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit only' })).toHaveCount(0);
});

test('a submitted invoice offers nothing that changes its totals', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).posFixture.pos.selectedInvoiceName({
      name: 'SINV-2026-0002',
      docstatus: 1,
    })
  );
  await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeVisible();
  await expect(page.getByText('Redeem loyalty points')).toHaveCount(0);
  await expect(page.getByText('Apply coupon code')).toHaveCount(0);

  await page.evaluate(() => {
    const { pos, openSavedInvoice } = (window as any).posFixture;
    pos.closeAllModals();
    openSavedInvoice(1);
  });
  await page.getByRole('button', { name: /1 item/ }).click();
  const cart = page.getByRole('dialog', { name: 'Cart', exact: true });
  await expect(cart.getByRole('button', { name: /^Pay / })).toBeVisible();
  for (const name of ['Hold', 'Increase', 'Decrease', 'Remove']) {
    await expect(cart.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(cart.getByRole('combobox')).toHaveCount(0);
  await expect(cart.getByRole('button', { name: 'Organic Assam Tea' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(cart).toBeHidden();

  await page.getByRole('button', { name: 'POS actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Item Enquiry' })).toBeVisible();
  for (const name of ['Loyalty Program', 'Coupon Code', 'Price List']) {
    await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
  }
});

test('the menu opens each quick action as a sheet', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  for (const [row, title] of [
    ['Saved and Submitted Invoices', 'Invoices'],
    ['Return Sales Invoice', 'Return an invoice'],
    ['Loyalty Program', 'Redeem loyalty points'],
    ['Coupon Code', 'Coupon code'],
    ['Price List', 'Price list'],
    ['Item Enquiry', 'Item enquiry'],
    ['Close POS Shift', 'Close POS shift'],
  ]) {
    await page.getByRole('button', { name: 'POS actions' }).click();
    await page.getByRole('menuitem', { name: row }).click();
    await expectSheet(page.getByRole('dialog', { name: title, exact: true }));
    await closeSheets(page);
  }
});

const sheets = [
  ['SavedInvoice', 'Invoices', 'Open invoice'],
  ['ReturnSalesInvoice', 'Return an invoice', 'Create return'],
  ['LoyaltyProgram', 'Redeem loyalty points', 'Redeem'],
  ['CouponCode', 'Coupon code', 'Done'],
  ['PriceList', 'Price list', 'Apply'],
  ['ItemEnquiry', 'Item enquiry', 'Submit'],
  ['BatchSelection', 'Select batch', 'Select'],
  ['ShiftClose', 'Close POS shift', 'Close shift'],
];

test('an invoice is picked by tapping its row, which shows a check', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).posFixture.showModal('ReturnSalesInvoice')
  );
  const sheet = page.getByRole('dialog', { name: 'Return an invoice' });
  const create = sheet.getByRole('button', { name: 'Create return' });
  await expect(create).toBeDisabled();

  const row = sheet
    .getByRole('listitem')
    .filter({ hasText: 'SINV-2026-0002' });
  await row.click();

  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(row).not.toHaveAttribute('data-state', 'active');
  await expect(sheet.locator('.lucide-check')).toHaveCount(1);
  await expect(create).toBeEnabled();
});

test('negative loyalty points show a field error, not a toast', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).posFixture.showModal('LoyaltyProgram')
  );
  const sheet = page.getByRole('dialog', { name: 'Redeem loyalty points' });
  await sheet.locator('input').first().fill('-5');
  await sheet.getByRole('button', { name: 'Redeem', exact: true }).click();

  await expect(sheet.getByText('Loyalty points cannot be negative.')).toBeVisible();
  await expect(sheet).toBeVisible();
  await expect(
    page.locator('[data-sonner-toast]', {
      hasText: 'Loyalty points cannot be negative.',
    })
  ).toHaveCount(0);
});

test('every POS dialog opens as a bottom sheet', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  for (const [name, title, action] of sheets) {
    await page.evaluate((name) => {
      (window as any).posFixture.showModal(name);
    }, name);
    const sheet = page.getByRole('dialog', { name: title, exact: true });
    await expectSheet(sheet);
    const button = sheet.getByRole('button', { name: action, exact: true });
    await expect(button).toBeInViewport();
    expect((await button.boundingBox())!.height).toBe(40);
    await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
    await closeSheets(page);
  }

  await page.evaluate(() => (window as any).posFixture.closeShift());
  const opening = page.getByRole('dialog', { name: 'Open POS shift' });
  await expectSheet(opening);
  await expect(
    opening.getByRole('button', { name: 'Open shift', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ShiftOpen.png') });
});

test('shift sheets count cash with steppers', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.showModal('ShiftClose'));
  const sheet = page.getByRole('dialog', { name: 'Close POS shift' });
  const count = sheet.getByRole('spinbutton', { name: /Count of .*500\.00/ });
  const cash = sheet.getByRole('listitem').filter({ hasText: /^\s*Cash/ });
  const before = Number(await count.inputValue());
  const counted = await cash.textContent();
  await sheet.getByRole('button', { name: 'Increase' }).last().click();
  await expect(count).toHaveValue(String(before + 1));
  await expect(cash).not.toHaveText(counted!);
  await page.screenshot({ path: test.info().outputPath('close-shift.png') });
});

test('the counted drawer is shared by the cash methods', async ({ page }) => {
  // Cash expects 1,000.00 and Store Cash 500.00; the opening 1,760.00 is counted.
  await page.evaluate(() => (window as any).posFixture.showModal('ShiftClose'));
  const sheet = page.getByRole('dialog', { name: 'Close POS shift' });
  await expect(sheet.getByText('Counted Credit Card')).toBeVisible();
  await expect(sheet.getByText('Counted Cash')).toHaveCount(0);
  await expect(sheet.getByText('Counted Store Cash')).toHaveCount(0);

  const row = (name: string) =>
    sheet.getByRole('listitem').filter({ hasText: new RegExp(`^\\s*${name}`) });
  await expect(row('Cash')).toHaveText(
    /260.00\s*Expected 1,000.00\s*Counted 1,260.00/
  );
  await expect(row('Store Cash')).toHaveText(
    /0.00\s*Expected 500.00\s*Counted 500.00/
  );
});

test('large shift amounts fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => (window as any).posFixture.showModal('ShiftClose'));
  const sheet = page.getByRole('dialog', { name: 'Close POS shift' });
  const count = sheet.getByRole('spinbutton', { name: /Count of .*500\.00/ });
  await count.fill('9999999');
  await count.press('Tab');
  await expect(
    sheet.getByRole('listitem').filter({ hasText: /^\s*Cash/ })
  ).toContainText(/Counted [\d,]{13,}\.00/);

  const rows = await sheet
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => item.scrollWidth <= item.clientWidth)
    );
  expect(rows.every(Boolean)).toBe(true);
});

test('leaving a sale with items asks in a sheet', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  await page.getByRole('button', { name: 'Exit POS' }).click();
  const sheet = page.getByRole('dialog', { name: 'Leave this sale?' });
  await expectSheet(sheet);
  for (const name of ['Save and Continue', 'Discard and Continue', 'Cancel']) {
    await expect(
      sheet.getByRole('button', { name, exact: true })
    ).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath('leave.png') });
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).toBeHidden();
});

test('opening a saved invoice shows its cart', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.openSavedInvoice());
  await expectSheet(page.getByRole('dialog', { name: 'Cart' }));
});

test('scanning with the camera adds the item', async ({ page }) => {
  // Stands in for the camera: reads one code as soon as it starts.
  await page.route('**/html5-qrcode.min.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.Html5QrcodeSupportedFormats = {};
      window.Html5Qrcode = class {
        isScanning = false;
        async start(camera, config, onScan) {
          this.isScanning = true;
          setTimeout(() => onScan('Organic Assam Tea'), 50);
        }
        async stop() { this.isScanning = false; }
        clear() {}
      };`,
    })
  );

  await page.getByRole('button', { name: 'Scan barcode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scan barcode' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /\d+ items?/ })).toContainText(
    '1 item'
  );
});

async function expectSheet(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveClass(/rounded-t-\[36px\]/);
  await sheet.evaluate((element) =>
    Promise.all(element.getAnimations().map(({ finished }) => finished))
  );
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
}

async function closeSheets(page: Page) {
  await page.evaluate(() => (window as any).posFixture.pos.closeAllModals());
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
