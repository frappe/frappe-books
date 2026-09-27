import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Books' });

test('the menu opens a drawer that works as an accordion', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(drawer(page)).toBeVisible();

  const sales = drawer(page).getByRole('button', {
    name: 'Sales',
    exact: true,
  });
  await sales.click();
  await expect(sales).toHaveAttribute('aria-expanded', 'true');
  await drawer(page).getByRole('button', { name: 'Purchases' }).click();
  await expect(sales).toHaveAttribute('aria-expanded', 'false');

  await drawer(page).getByRole('link', { name: 'Purchase Invoices' }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(page).toHaveURL(/\/books\/list\/PurchaseInvoice$/);
});

test('desktop-only pages are left out and redirect home', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await drawer(page).getByRole('button', { name: 'Setup' }).click();
  await expect(
    drawer(page).getByRole('link', { name: 'Settings' })
  ).toBeVisible();
  for (const name of [
    'Chart of Accounts',
    'Import Wizard',
    'Print Templates',
  ]) {
    await expect(drawer(page).getByRole('link', { name })).toHaveCount(0);
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
});
