import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

const navSheet = (page: Page) => page.getByRole('dialog', { name: 'Books' });
const tabs = (page: Page) => page.locator('[data-slot="mobile-nav"]');
const tab = (page: Page, name: string) =>
  tabs(page).getByRole('button', { name, exact: true });

test('bottom tabs open each section and light the page owner', async ({
  page,
}) => {
  await expect(tab(page, 'Dashboard')).toHaveAttribute('data-state', 'active');

  await tab(page, 'Purchases').click();
  await expect(page).toHaveURL(/\/books\/list\/PurchaseInvoice$/);
  await expect(tab(page, 'Purchases')).toHaveAttribute('data-state', 'active');

  await tab(page, 'Sales').click();
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
  await tab(page, 'Reports').click();
  await expect(page).toHaveURL(/\/books\/report\/GeneralLedger$/);
  await expect(tab(page, 'Reports')).toHaveAttribute('data-state', 'active');

  await page.goto('/books/list/Payment/Purchase%20Payments');
  await expect(tab(page, 'Purchases')).toHaveAttribute('data-state', 'active');
  await expect(tab(page, 'Sales')).toHaveAttribute('data-state', 'inactive');
});

test('the menu opens a nav sheet that works as an accordion', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(navSheet(page)).toBeVisible();

  const sales = navSheet(page).getByRole('button', {
    name: 'Sales',
    exact: true,
  });
  await sales.click();
  await expect(sales).toHaveAttribute('aria-expanded', 'true');
  await navSheet(page).getByRole('button', { name: 'Purchases' }).click();
  await expect(sales).toHaveAttribute('aria-expanded', 'false');

  await navSheet(page).getByRole('link', { name: 'Purchase Invoices' }).click();
  await expect(navSheet(page)).toBeHidden();
  await expect(page).toHaveURL(/\/books\/list\/PurchaseInvoice$/);
});

test('desktop-only pages are left out and redirect home', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await navSheet(page).getByRole('button', { name: 'Setup' }).click();
  await expect(
    navSheet(page).getByRole('link', { name: 'Settings' })
  ).toBeVisible();
  for (const name of [
    'Chart of Accounts',
    'Import Wizard',
    'Print Templates',
  ]) {
    await expect(navSheet(page).getByRole('link', { name })).toHaveCount(0);
  }

  await page.goto('/books/chart-of-accounts');
  await waitForBooks(page);
  await expect(page).toHaveURL(/\/books\/?$/);
});

test('pushed pages show a back button instead of the menu', async ({
  page,
}) => {
  await page.goto('/books/edit/SalesInvoice/new-phone-shell');
  await waitForBooks(page);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(0);
});

test('a report title switches to the other reports', async ({ page }) => {
  await tab(page, 'Reports').click();
  await page
    .getByRole('button', { name: 'General Ledger', exact: true })
    .click();

  const sheet = page.getByRole('dialog', { name: 'Reports' });
  await expect(sheet.getByRole('option')).toContainText([
    'General Ledger',
    'Profit And Loss',
    'Balance Sheet',
    'Trial Balance',
  ]);
  await expect(
    sheet.getByRole('option', { name: 'General Ledger' })
  ).toHaveAttribute('aria-selected', 'true');

  await sheet.getByRole('option', { name: 'Balance Sheet' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/books\/report\/BalanceSheet$/);
  await expect(
    page.getByRole('button', { name: 'Balance Sheet', exact: true })
  ).toBeVisible();
});

test('back closes the nav sheet before leaving the page', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await navSheet(page)
    .getByRole('button', { name: 'Sales', exact: true })
    .click();
  await navSheet(page).getByRole('link', { name: 'Sales Quotes' }).click();
  await expect(page).toHaveURL(/\/books\/list\/SalesQuote$/);

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(navSheet(page)).toBeVisible();
  await page.evaluate(() => history.back());

  await expect(navSheet(page)).toBeHidden();
  await expect(page).toHaveURL(/\/books\/list\/SalesQuote$/);
});

test('back closes an open menu before leaving the page', async ({ page }) => {
  await tab(page, 'Sales').click();
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
  await tab(page, 'Dashboard').click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.evaluate(() => history.back());

  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page).toHaveURL(/\/books\/?$/);
});

test('a right-to-left language lays Books out right to left', async ({
  page,
}) => {
  // Frappe sets the direction from the user's language, as for Arabic.
  await page.route(
    (url) => url.pathname === '/books',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace('dir="ltr"', 'dir="rtl"')
        .replace("layout_direction = 'ltr'", "layout_direction = 'rtl'");
      await route.fulfill({ response, body });
    }
  );
  await page.goto('/books');
  await waitForBooks(page);
  await expect(page.locator('#books-app')).toHaveAttribute('dir', 'rtl');

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(navSheet(page)).toBeVisible();
  await expect(navSheet(page)).toHaveCSS('direction', 'rtl');
});
