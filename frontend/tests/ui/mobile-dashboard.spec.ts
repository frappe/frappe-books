import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

// Registered before the session opens Books, so no test depends on the site's accounts.
test.beforeEach(async ({ page }) => {
  const balances = {
    accounts: [{ account: 'Cash - RB', account_name: 'Cash', balance: 1500 }],
    total: 1500,
    as_of: '2031-12-15',
  };
  await page.route(/reports\.dashboard\.get_cash_balances/, (route) =>
    route.fulfill({ json: { message: balances } })
  );
  const sellers = {
    items: [{ item: 'ATLAS-01', item_name: 'World Atlas', amount: 5000 }],
    total: 5000,
  };
  await page.route(/reports\.dashboard\.get_best_sellers/, (route) =>
    route.fulfill({ json: { message: sellers } })
  );
});

useBooksSession();

const createButton = (page: Page) =>
  page
    .locator('header:visible')
    .getByRole('button', { name: 'Create', exact: true });

test('the period sheet changes the dashboard period', async ({ page }) => {
  await page.getByRole('button', { name: 'This year' }).click();
  const sheet = page.getByRole('dialog', { name: 'Period' });
  await expect(
    sheet.getByRole('option', { name: 'This year' })
  ).toHaveAttribute('aria-selected', 'true');

  await sheet.getByRole('option', { name: 'This quarter' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'This quarter' })
  ).toBeVisible();
});

test('the create menu opens a new sales invoice', async ({ page }) => {
  await createButton(page).click();
  const menu = page.getByRole('menu');
  for (const name of [
    'Sales Invoice',
    'Receive payment',
    'Purchase Invoice',
    'Make payment',
    'Customer',
    'Item',
  ]) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  }

  await menu.getByRole('menuitem', { name: 'Sales Invoice' }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/[^/]+$/);
});

test('a tap on a chart shows the tapped month', async ({ page }) => {
  // An empty period draws no plot, so the cashflow gets months of its own.
  const months = [1, 2, 3, 4, 5, 6].map((month) => ({
    yearmonth: `2031-0${month}`,
    inflow: month * 100,
    outflow: month * 40,
  }));
  await page.route(/reports\.dashboard\.get_cashflow/, (route) =>
    route.fulfill({ json: { message: { months, has_data: true } } })
  );
  await page.reload();

  const plot = page.locator('[data-slot="chart-container"]', {
    hasText: 'Cashflow',
  });
  await plot.scrollIntoViewIfNeeded();
  await expect(plot.locator('svg, canvas').first()).toBeVisible();
  const box = (await plot.boundingBox())!;
  const tapAt = (share: number) =>
    page.touchscreen.tap(box.x + box.width * share, box.y + box.height / 3);
  const tooltip = page.getByRole('tooltip');

  await tapAt(0.85);
  await expect(tooltip).toBeVisible();
  const reading = await tooltip.textContent();

  await tapAt(0.3);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveText(reading ?? '');
});

test('a section that fails to load can be retried', async ({ page }) => {
  let fail = true;
  await page.route(/reports\.dashboard\.get_top_expenses/, (route) =>
    fail ? route.abort() : route.continue()
  );
  await page.reload();
  await expect(page.getByText('Failed to load')).toBeVisible();

  fail = false;
  // The aborted request can also raise the offline screen, which has its own Try again.
  const expenses = page.locator('[data-slot="chart-container"]', {
    hasText: 'Top expenses',
  });
  await expenses.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Failed to load')).toBeHidden();
  await expect(expenses).toHaveAttribute('data-state', /ready|empty/);
});

test('top expenses shows the full total spending under its title', async ({
  page,
}) => {
  const expenses = [
    { account: 'Rent', total: 1000000 },
    { account: 'Travel', total: 234567.89 },
  ];
  await page.route(/reports\.dashboard\.get_top_expenses/, (route) =>
    route.fulfill({ json: { message: expenses } })
  );
  await page.reload();

  await expect(
    page.locator('[data-slot="chart-container"]', { hasText: 'Top expenses' })
  ).toContainText('Total spending: ₹ 12,34,567.89');
});

test('account balances sit full width on a card of their own', async ({
  page,
}) => {
  const balances = page.locator('[data-slot="chart-container"]', {
    hasText: 'Account balances',
  });
  const card = balances.locator('..');
  await card.scrollIntoViewIfNeeded();
  await expect(balances).toHaveAttribute('data-state', 'ready');

  const box = (await card.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(viewport.width - 40);
  expect(box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.height).toBe(288);
  await expect(card).toHaveCSS('border-top-style', 'solid');
});

// covers: AC-7
test('choose accounts opens the General tab of the settings page', async ({
  page,
}) => {
  const balances = page.locator('[data-slot="chart-container"]', {
    hasText: 'Account balances',
  });
  await balances.scrollIntoViewIfNeeded();
  await balances.getByRole('link', { name: 'Choose accounts' }).click();

  await expect(page).toHaveURL(/\/books\/settings\?tab=AccountingSettings$/);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'General' })).toBeChecked();
});

test('best sellers sit full width on a card of their own', async ({ page }) => {
  const sellers = page.locator('[data-slot="chart-container"]', {
    hasText: 'Best sellers',
  });
  const card = sellers.locator('..');
  await card.scrollIntoViewIfNeeded();
  await expect(sellers).toHaveAttribute('data-state', 'ready');

  const box = (await card.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(viewport.width - 40);
  expect(box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.height).toBe(384);
  await expect(card).toHaveCSS('border-top-style', 'solid');
});

test('invoice cards name their totals in sentence case', async ({ page }) => {
  for (const title of [
    'Paid sales',
    'Unpaid sales',
    'Paid purchases',
    'Unpaid purchases',
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});
