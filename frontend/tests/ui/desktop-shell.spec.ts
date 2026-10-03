import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

useBooksSession();

const sidebar = (page: Page) =>
  page.getByRole('navigation', { name: 'Books', exact: true });
const headers = (page: Page) => page.locator('header:visible');

test('sidebar items are links that open their page', async ({ page }) => {
  const sales = sidebar(page).getByRole('link', { name: 'Sales', exact: true });
  await expect(sales).toHaveAttribute('href', '/books/list/SalesInvoice');

  await sales.click();
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
  const quotes = sidebar(page).getByRole('link', { name: 'Sales Quotes' });
  await expect(quotes).toBeVisible();

  await quotes.click();
  await expect(page).toHaveURL(/\/books\/list\/SalesQuote$/);
  await expect(quotes).toHaveAttribute('aria-current', 'page');
});

test('a page without a sidebar entry highlights none', async ({ page }) => {
  const current = sidebar(page).locator('[aria-current="page"]');
  await expect(current).toHaveText('Dashboard');
  await page.goto('/books/list/SerialNumber');
  await expect(headers(page)).toContainText('Serial Number');
  await expect(current).toHaveCount(0);

  await sidebar(page).getByRole('link', { name: 'Dashboard' }).click();
  await expect(current).toHaveText('Dashboard');
  await page.goBack();
  await expect(headers(page)).toContainText('Serial Number');
  await expect(current).toHaveCount(0);
});

test('only the current page header shows after moving between cached pages', async ({
  page,
}) => {
  await expect(headers(page)).toHaveCount(1);
  await expect(headers(page)).toContainText('Dashboard');

  await sidebar(page).getByRole('link', { name: 'Sales', exact: true }).click();
  await expect(headers(page)).toHaveCount(1);
  await expect(headers(page)).toContainText('Sales Invoice');

  await page.goBack();
  await expect(page).toHaveURL(/\/books\/?$/);
  await expect(headers(page)).toHaveCount(1);
  await expect(headers(page)).toContainText('Dashboard');
});

test('Ctrl+K opens Quick Search after moving to another page', async ({
  page,
}) => {
  await sidebar(page).getByRole('link', { name: 'Sales', exact: true }).click();
  await expect(headers(page)).toContainText('Sales Invoice');

  await page.keyboard.press('ControlOrMeta+KeyK');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the sidebar header menu opens help and account actions', async ({
  page,
}) => {
  const header = page.getByTestId('company-name');
  await expect(header).toContainText(/\S/);

  await header.getByRole('button').click();
  for (const name of [
    'Documentation',
    'Keyboard shortcuts',
    'Apps',
    'Log out',
  ]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }

  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByText('Open quick search')).toBeVisible();
});

test('the sidebar hides and comes back from the page header', async ({
  page,
}) => {
  await sidebar(page).getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(sidebar(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(sidebar(page)).toBeVisible();
});

test('chart of accounts groups expand from a row, Expand and Collapse', async ({
  page,
}) => {
  await page.goto('/books/chart-of-accounts');
  const tree = page.getByRole('tree', { name: 'Chart of Accounts' });
  const rows = tree.getByRole('treeitem');
  const headerButton = (name: string) =>
    headers(page).getByRole('button', { name, exact: true });
  await expect(rows.first()).toBeVisible();
  const rootCount = await rows.count();

  await tree.getByRole('button', { name: 'Expenses', exact: true }).click();
  await expect.poll(() => rows.count()).toBeGreaterThan(rootCount);

  const oneGroupCount = await rows.count();
  await headerButton('Expand').click();
  await expect.poll(() => rows.count()).toBeGreaterThan(oneGroupCount);
  await expect(headerButton('Expand')).toBeHidden();

  await headerButton('Collapse').click();
  await expect(rows).toHaveCount(rootCount);
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

test('a logout elsewhere sends the next action to the login page', async ({
  page,
}) => {
  await page.context().clearCookies();

  await sidebar(page).getByRole('link', { name: 'Sales', exact: true }).click();

  await expect(page).toHaveURL(/\/login\?redirect-to=%2Fbooks$/);
});
