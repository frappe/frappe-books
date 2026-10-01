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

test('the sidebar header menu opens help and account actions', async ({
  page,
}) => {
  const header = page.getByTestId('company-name');
  await expect(header).toContainText(/\S/);

  await header.getByRole('button').click();
  for (const name of [
    'Documentation',
    'Keyboard Shortcuts',
    'Apps',
    'Log Out',
  ]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }

  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts' }).click();
  await expect(page.getByText('Open Quick Search')).toBeVisible();
});

test('the sidebar hides and comes back from the page header', async ({
  page,
}) => {
  await sidebar(page).getByRole('button', { name: 'Hide Sidebar' }).click();
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

test('a logout elsewhere sends the next action to the login page', async ({
  page,
}) => {
  await page.context().clearCookies();

  await sidebar(page).getByRole('link', { name: 'Sales', exact: true }).click();

  await expect(page).toHaveURL(/\/login\?redirect-to=%2Fbooks$/);
});
