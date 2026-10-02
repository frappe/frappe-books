import { expect, test, type Page } from '@playwright/test';
import { serveFixture } from './helpers/fixture-server';

const fixtureUrl = serveFixture('mobile-reports');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  await page.goto(fixtureUrl());
  await expect(row(page, 'Income')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test('account groups collapse and expand their rows', async ({ page }) => {
  const group = row(page, 'Direct Income');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'Sales')).toBeVisible();

  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 'Sales')).toBeHidden();
  await expect(row(page, 'Total Income (Credit)')).toBeVisible();

  await group.click();
  await expect(row(page, 'Sales')).toBeVisible();
});

test('the column picker changes the value column', async ({ page }) => {
  const sales = row(page, 'Sales');
  await expect(sales).toContainText('12,34,51,000.00');

  await page.getByRole('button', { name: /^Column/ }).click();
  const options = page.getByRole('option');
  await expect(options).toHaveText(['Total', 'Aug 31, 2026', 'Jul 31, 2026']);
  await options.nth(1).click();

  await expect(sales).toContainText('12,34,50,000.00');
  await expect(page.getByRole('button', { name: /^Column/ })).toContainText(
    'Aug 31, 2026'
  );
  // The choice is kept for the report.
  await show(page, 'GeneralLedger');
  await show(page, 'ProfitAndLoss');
  await expect(row(page, 'Sales')).toContainText('12,34,50,000.00');
});

test('a row opens every column in a detail sheet', async ({ page }) => {
  await row(page, 'Sales').click();
  const details = page.getByTestId('report-row-details');
  await expect(details.locator('dt')).toHaveText([
    'Account',
    'Aug 31, 2026',
    'Jul 31, 2026',
    'Total',
  ]);
  await expect(details.locator('dd')).toHaveText([
    'Sales',
    '12,34,50,000.00',
    '1,000.00',
    '12,34,51,000.00',
  ]);

  await page.keyboard.press('Escape');
  await show(page, 'GeneralLedger');
  await page.getByTestId('report-row').filter({ hasText: 'SINV-102' }).click();
  await expect(details.locator('dt')).toContainText([
    'Account',
    'Date',
    'Debit',
    'Credit',
    'Balance',
    'Party',
    'Ref Name',
    'Ref Type',
  ]);
  await expect(
    page.getByRole('button', { name: 'Open SINV-102' })
  ).toBeVisible();
});

test('ledgers group entries under dates with debit or credit', async ({
  page,
}) => {
  await show(page, 'GeneralLedger');
  const entries = page.getByTestId('report-row');
  await expect(entries).toHaveCount(5);
  await expect(entries.nth(0)).toContainText('Opening');
  await expect(entries.nth(1)).toContainText('32,332.00 Dr');
  await expect(entries.nth(2)).toContainText('27,400.00 Cr');
  await expect(page.getByText('Sep 27, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('Sep 26, 2026', { exact: true })).toBeVisible();
});

test('stock balance groups locations under items with a total', async ({
  page,
}) => {
  await show(page, 'StockBalance');
  const item = row(page, 'Printed Brochures (100)');
  await expect(item).toContainText('2 locations');
  await expect(item).toContainText('104.00');
  await expect(row(page, 'Showroom')).toBeHidden();

  await item.click();
  await expect(row(page, 'Showroom')).toBeVisible();
  await expect(row(page, 'Total')).toContainText('294.00');
});

test('reports fit a phone screen without sideways scrolling', async ({
  page,
}) => {
  for (const name of [
    'ProfitAndLoss',
    'GeneralLedger',
    'StockBalance',
    'StockLedger',
  ]) {
    await show(page, name);
    const width = await page.evaluate(
      () => document.scrollingElement!.scrollWidth
    );
    expect(width, name).toBeLessThanOrEqual(390);
    await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  }
});

test('trial balance scrolls sideways instead of wrapping accounts', async ({
  page,
}) => {
  await show(page, 'TrialBalance');
  const name = page.getByText('Application of Funds (Assets)', { exact: true });
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true
  );

  const scroller = page
    .locator('[data-slot="scroll-area-viewport"]')
    .filter({ has: name });
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true
  );
});

test('long account names wrap and keep their amounts on screen', async ({
  page,
}) => {
  const name = 'Implementation & Development Income';
  const label = await page.getByText(name, { exact: true }).boundingBox();
  const sales = await page.getByText('Sales', { exact: true }).boundingBox();
  const amount = await row(page, name).locator('[dir="ltr"]').boundingBox();

  expect(label!.height).toBeGreaterThan(sales!.height * 1.5);
  expect(amount!.x - label!.x - label!.width).toBeGreaterThanOrEqual(24);
  expect(amount!.x + amount!.width).toBeLessThanOrEqual(390);
});

test('labels and amounts keep a gap between them', async ({ page }) => {
  await show(page, 'TrialBalance');
  const name = 'Application of Funds (Assets)';
  const label = await page.getByText(name, { exact: true }).boundingBox();
  const amounts = await row(page, name)
    .locator('[dir="ltr"]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));

  expect(amounts[0].left - label!.x - label!.width).toBeGreaterThanOrEqual(24);
  expect(amounts[1].left - amounts[0].right).toBeGreaterThanOrEqual(24);
});

function row(page: Page, name: string) {
  return page.getByRole('button', { name, exact: false }).filter({
    has: page.getByText(name, { exact: true }),
  });
}

async function show(page: Page, name: string) {
  await page.evaluate(
    (name) => (window as any).mobileReportFixture.show(name),
    name
  );
}
