import { expect, test, type Page } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
useBooksSession();

const run = Date.now().toString(36);
const customer = `Search Customer ${run}`;
let hasCustomer = false;

test.beforeEach(async ({ page }) => {
  if (hasCustomer) return;
  await insertDocument(page, 'Books Party', {
    name: customer,
    role: 'Customer',
  });
  hasCustomer = true;
});

const searchbox = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search Frappe Books' });
const results = (page: Page) => page.getByRole('list', { name: 'Results' });
const result = (page: Page, text: string | RegExp) =>
  results(page).getByRole('listitem').filter({ hasText: text });

async function openSearch(page: Page, query: string) {
  await page.goto('/books/search');
  await waitForBooks(page);
  await searchbox(page).fill(query);
}

test('the Search tab opens search with the input focused', async ({ page }) => {
  const tab = page
    .locator('[data-slot="mobile-nav"]')
    .getByRole('button', { name: 'Search', exact: true });
  await tab.click();
  await expect(page).toHaveURL(/\/books\/search$/);
  await expect(tab).toHaveAttribute('data-state', 'active');
  await expect(searchbox(page)).toBeFocused();
});

test('a result opens its record, back keeps the search and Recent reopens it', async ({
  page,
}) => {
  await openSearch(page, customer);
  await result(page, customer).click();
  await expect(page).toHaveURL(/\/books\/edit\/Party\//);

  await page.goBack();
  await expect(searchbox(page)).toHaveValue(customer);

  await searchbox(page).fill('');
  const recent = result(page, customer);
  await expect(recent).toContainText('Recent');
  await recent.click();
  await expect(page).toHaveURL(/\/books\/edit\/Party\//);
});

test('group chips and the filters sheet narrow the results', async ({
  page,
}) => {
  await openSearch(page, customer);
  const record = result(page, customer);
  await expect(record).toBeVisible();

  const docs = page.getByRole('button', { name: 'Docs', exact: true });
  await docs.click();
  await expect(docs).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('No results')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(record).toBeVisible();

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Search filters' });
  await sheet.getByRole('button', { name: 'Party', exact: true }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(record).toBeHidden();
  await expect(page.getByRole('button', { name: 'Filters · 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
});

test('desktop-only pages are left out of the results', async ({ page }) => {
  await openSearch(page, 'Import Wizard');
  await expect(page.getByText('No results')).toBeVisible();

  await searchbox(page).fill('Settings');
  await expect(result(page, /^Settings\s*Page$/)).toBeVisible();
});
