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
  expect((await cartBar.boundingBox())!.height).toBe(48);
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
  await expect(page.getByRole('status')).toContainText('Change due');
  await page.screenshot({ path: test.info().outputPath('payment.png') });

  await page.getByRole('radio', { name: 'Bank Transfer' }).click();
  await expect(page.getByRole('textbox', { name: /Ref\./ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pay', exact: true })
  ).toBeDisabled();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /6 items/ })).toBeVisible();
});

test('the menu opens each quick action as a sheet', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.fillCart());
  for (const [row, title] of [
    ['Saved and Submitted Invoices', 'Saved and Submitted Invoices'],
    ['Return Sales Invoice', 'Return Sales Invoice'],
    ['Loyalty Program', 'Redeem Loyalty Points'],
    ['Coupon Code', 'Apply Coupon Code'],
    ['Price List', 'Apply Price List'],
    ['Item Enquiry', 'Item Enquiry'],
    ['Close POS Shift', 'Close POS Shift'],
  ]) {
    await page.getByRole('button', { name: 'POS actions' }).click();
    const menu = page.getByRole('dialog', { name: 'Point of Sale' });
    await menu.getByRole('button', { name: row }).click();
    await expectSheet(page.getByRole('dialog', { name: title, exact: true }));
    await closeSheets(page);
  }
});

const sheets = [
  ['SavedInvoice', 'Saved and Submitted Invoices', 'Open Invoice'],
  ['ReturnSalesInvoice', 'Return Sales Invoice', 'Create Return'],
  ['LoyaltyProgram', 'Redeem Loyalty Points', 'Save'],
  ['CouponCode', 'Apply Coupon Code', 'Save'],
  ['PriceList', 'Apply Price List', 'Save'],
  ['ItemEnquiry', 'Item Enquiry', 'Submit'],
  ['BatchSelection', 'Select Batch', 'Select'],
  ['ShiftClose', 'Close POS Shift', 'Close Shift'],
];

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
  const opening = page.getByRole('dialog', { name: 'Open POS Shift' });
  await expectSheet(opening);
  await expect(
    opening.getByRole('button', { name: 'Open Shift', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ShiftOpen.png') });
});

test('shift sheets count cash with steppers', async ({ page }) => {
  await page.evaluate(() => (window as any).posFixture.showModal('ShiftClose'));
  const sheet = page.getByRole('dialog', { name: 'Close POS Shift' });
  const count = sheet.getByRole('spinbutton', { name: /Count of .*500\.00/ });
  const cash = sheet.getByRole('row', { name: /^Cash/ });
  const before = Number(await count.inputValue());
  const counted = await cash.textContent();
  await sheet.getByRole('button', { name: 'Increase' }).last().click();
  await expect(count).toHaveValue(String(before + 1));
  await expect(cash).not.toHaveText(counted!);
  await page.screenshot({ path: test.info().outputPath('close-shift.png') });
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
