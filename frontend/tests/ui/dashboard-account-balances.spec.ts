import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

const CASH_BALANCES = /reports\.dashboard\.get_cash_balances/;

const balances = {
  accounts: [
    { account: 'Cash - RB', account_name: 'Cash', balance: 1500 },
    { account: 'Overdraft - RB', account_name: 'Overdraft', balance: -250 },
    { account: 'Petty Cash - RB', account_name: 'Petty Cash', balance: 0 },
  ],
  total: 1250,
  as_of: '2031-12-15',
};

let response: unknown = balances;
test.beforeEach(async ({ page }) => {
  response = balances;
  await page.route(CASH_BALANCES, (route) =>
    route.fulfill({ json: { message: response } })
  );
});

useBooksSession();

const card = (page: Page) =>
  page.locator('[data-slot="chart-container"]', {
    hasText: 'Account balances',
  });

async function showBalances(page: Page, accounts: unknown[]) {
  response = { ...balances, accounts };
  await page.reload();
}

test('the card lists each balance and the total as of today', async ({
  page,
}) => {
  const table = card(page).getByRole('table');
  await expect(card(page)).toContainText('As of today');
  await expect(table.getByRole('row')).toHaveCount(5);

  const amount = (name: string) =>
    table
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name, exact: true }) })
      .getByRole('cell')
      .last();
  const total = table.getByRole('row').filter({ hasText: 'Total' });
  // Whole amounts, so the checks hold for any site currency and precision.
  await expect(amount('Cash')).toContainText('1,500');
  await expect(amount('Cash')).toHaveClass(/text-ink-green-5/);
  await expect(amount('Overdraft')).toHaveText(/-.*250/);
  await expect(amount('Overdraft')).toHaveClass(/text-ink-red-6/);
  await expect(amount('Petty Cash')).toHaveText(/^\D*0([.,]0+)?\D*$/);
  await expect(amount('Petty Cash')).toHaveClass(/text-ink-gray-8/);
  await expect(total.getByRole('cell').last()).toContainText('1,250');
  await expect(total.getByRole('cell').last()).toHaveClass(/text-ink-green-5/);
  await expect(total.getByRole('link')).toHaveCount(0);
});

test('changing the period does not reload the balances', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => {
    requests += Number(CASH_BALANCES.test(request.url()));
  });

  const cashflow = page.waitForResponse(/reports\.dashboard\.get_cashflow/);
  await page.locator('header:visible').getByRole('combobox').click();
  await page.getByRole('option', { name: 'This quarter' }).click();
  await cashflow;

  expect(requests).toBe(0);
});

test('an account opens its ledger up to the as of date', async ({ page }) => {
  await card(page).getByRole('link', { name: 'Overdraft' }).click();

  await expect(page).toHaveURL(/\/books\/report\/GeneralLedger\?/);
  const query = new URL(page.url()).searchParams;
  expect(query.get('account')).toBe('Overdraft - RB');
  expect(query.get('toDate')).toBe('2031-12-15');
  expect(query.has('fromDate')).toBe(false);
});

test('a site without cash or bank accounts says so', async ({ page }) => {
  await showBalances(page, []);

  await expect(card(page)).toHaveAttribute('data-state', 'empty');
  await expect(card(page)).toContainText('No cash or bank accounts');
});

test('balances that fail to load can be retried', async ({ page }) => {
  await page.unroute(CASH_BALANCES);
  let fail = true;
  await page.route(CASH_BALANCES, (route) =>
    fail
      ? route.fulfill({ status: 500 })
      : route.fulfill({ json: { message: balances } })
  );
  await page.reload();
  await expect(card(page)).toHaveAttribute('data-state', 'error');

  fail = false;
  await card(page).getByRole('button', { name: 'Try again' }).click();
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  await expect(
    card(page).getByRole('link', { name: 'Overdraft' })
  ).toBeVisible();
});

test('many accounts scroll between the header and the total', async ({
  page,
}) => {
  const accounts = Array.from({ length: 30 }, (_, index) => ({
    account: `Bank ${index}`,
    account_name: `Bank ${index}`,
    balance: 100,
  }));
  await showBalances(page, accounts);

  const table = card(page).getByRole('table');
  const scroller = card(page).locator('.overflow-y-auto');
  const header = table.getByRole('columnheader', { name: 'Account' });
  // The cells stick, not the row, so measure the cell.
  const total = table
    .getByRole('row')
    .filter({ hasText: 'Total' })
    .getByRole('cell')
    .last();
  await card(page).scrollIntoViewIfNeeded();
  await expect(
    table.getByRole('link', { name: 'Bank 0', exact: true })
  ).toBeVisible();
  await expectWithin(total, scroller);

  await scroller.evaluate(
    (element) => (element.scrollTop = element.scrollHeight)
  );
  await expectWithin(header, scroller);
  await expectWithin(total, scroller);
});

test('the card takes the left half of its row', async ({ page }) => {
  const row = card(page).locator(
    'xpath=ancestor::div[contains(@class, "grid")][1]'
  );
  await card(page).scrollIntoViewIfNeeded();
  const [cardBox, rowBox] = await Promise.all([
    card(page).boundingBox(),
    row.boundingBox(),
  ]);

  expect(cardBox!.width).toBeLessThan(rowBox!.width * 0.6);
  expect(Math.abs(cardBox!.x - rowBox!.x)).toBeLessThan(2);
});

// covers: AC-11
test('coming back to the dashboard reloads the balances once', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    requests += Number(CASH_BALANCES.test(request.url()));
  });
  const sidebar = page.getByRole('navigation', { name: 'Books', exact: true });

  await sidebar
    .getByRole('link', { name: 'Sales Invoice', exact: true })
    .click();
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
  expect(requests).toBe(0);

  const reloaded = page.waitForResponse(CASH_BALANCES);
  await sidebar.getByRole('link', { name: 'Dashboard' }).click();
  await reloaded;
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  expect(requests).toBe(1);
});

// covers: AC-9
test('loading shows three bars at the card final height', async ({ page }) => {
  await page.unroute(CASH_BALANCES);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(CASH_BALANCES, async (route) => {
    await held;
    await route.fulfill({ json: { message: balances } });
  });
  await page.reload();

  await card(page).scrollIntoViewIfNeeded();
  await expect(card(page)).toHaveAttribute('data-state', 'loading');
  await expect(card(page).locator('.animate-pulse')).toHaveCount(3);
  const loading = (await card(page).boundingBox())!;

  release();
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  const ready = (await card(page).boundingBox())!;
  expect(ready.height).toBe(loading.height);
});

// covers: AC-10
test('a long account name truncates instead of widening the card', async ({
  page,
}) => {
  const name = 'A very long bank account name '.repeat(8).trim();
  await showBalances(page, [
    { account: 'Long - RB', account_name: name, balance: 10 },
  ]);

  const row = card(page).locator(
    'xpath=ancestor::div[contains(@class, "grid")][1]'
  );
  const link = card(page).getByRole('link', { name });
  await card(page).scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();

  const [cardBox, rowBox] = await Promise.all([
    card(page).boundingBox(),
    row.boundingBox(),
  ]);
  expect(cardBox!.width).toBeLessThan(rowBox!.width * 0.6);
  expect(
    await link.evaluate((element) => element.scrollWidth > element.clientWidth)
  ).toBe(true);
});

// covers: AC-4, AC-5 (a balance the server rounded to zero, sent as -0.0)
test('a balance rounded to zero shows without a sign in default ink', async ({
  page,
}) => {
  await page.unroute(CASH_BALANCES);
  await page.route(CASH_BALANCES, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: '{"message": {"accounts": [{"account": "Dust - RB", "account_name": "Dust", "balance": -0.0}], "total": -0.0, "as_of": "2031-12-15"}}',
    })
  );
  await page.reload();

  const amount = card(page)
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'Dust' }) })
    .getByRole('cell')
    .last();
  await expect(amount).toHaveText(/^\D*0([.,]0+)?\D*$/);
  await expect(amount).not.toContainText('-');
  await expect(amount).toHaveClass(/text-ink-gray-8/);
});

async function expectWithin(
  element: ReturnType<Page['locator']>,
  container: ReturnType<Page['locator']>
) {
  const [box, bounds] = await Promise.all([
    element.boundingBox(),
    container.boundingBox(),
  ]);
  expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height + 1
  );
}
