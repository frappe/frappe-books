import { expect, test, type Page } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
useBooksSession();

const run = Date.now().toString(36);
const customer = `Phone Customer ${run}`;
const supplier = `Phone Supplier ${run}`;
let hasParties = false;

test.beforeEach(async ({ page }) => {
  if (hasParties) return;
  await insertDocument(page, 'Books Party', {
    name: customer,
    role: 'Customer',
    phone: '98765 43210',
    email: `${run}@example.com`,
  });
  await insertDocument(page, 'Books Party', {
    name: supplier,
    role: 'Supplier',
  });
  hasParties = true;
});

test('rows show two lines and open their document', async ({ page }) => {
  await page.goto('/books/list/Party');
  await expect(
    page.getByRole('button', { name: 'New', exact: true })
  ).toBeVisible();
  await search(page, run);

  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible();
  const row = rows(page).filter({ hasText: customer });
  await expect(row).toContainText('Customer · 98765 43210');
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(68);

  await row.tap();
  await expect(page).toHaveURL(/\/books\/edit\/Party\//);
});

test('search also matches keyword fields', async ({ page }) => {
  await page.goto('/books/list/Party');
  await search(page, `${run}@example`);

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(customer);
});

test('selected items start a new sales invoice', async ({ page }) => {
  const items = [`Phone Item A ${run}`, `Phone Item B ${run}`];
  for (const name of items) {
    await insertDocument(page, 'Books Item', {
      name,
      rate: 100,
      income_account: 'Sales',
      expense_account: 'Cost of Goods Sold',
    });
  }
  await page.goto('/books/list/Item');
  await search(page, run);
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Select', exact: true }).tap();
  for (const name of items) {
    await rows(page).filter({ hasText: name }).tap();
  }
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(page.getByText('2 selected')).toBeVisible();
  await expect(page.locator('[data-slot="mobile-nav"]')).toHaveCount(0);
  const itemLoads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v2/document/Books%20Item/')) {
      itemLoads.push(request.url());
    }
  });
  await page.getByRole('button', { name: 'Create', exact: true }).tap();
  await page
    .getByRole('dialog', { name: 'Create' })
    .getByRole('button', { name: 'Sales Invoice' })
    .tap();

  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\//);
  await expect(page.getByText('2 rows', { exact: true })).toBeVisible();
  // The server's preview prices the rows; no item is loaded one by one.
  await expect(page.getByText(/^1\.00 × .*100\.00$/)).toHaveCount(2);
  expect(itemLoads).toEqual([]);
});

test('a filter chip narrows the list until it is removed', async ({ page }) => {
  await page.goto('/books/list/Party');
  await search(page, run);
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Filters', exact: true }).tap();
  await page
    .getByRole('dialog', { name: 'Filter by' })
    .getByRole('button', { name: /^Role/ })
    .tap();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('combobox', { name: 'Value' }).tap();
  await page.getByRole('option', { name: 'Supplier', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Apply', exact: true }).tap();

  await expect(sheet).toBeHidden();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(supplier);
  await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove filter Role' }).tap();
  await expect(rows(page)).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Filters', exact: true })
  ).toBeVisible();
});

test('date filters use the native picker', async ({ page }) => {
  await page.goto('/books/list/SalesInvoice');
  await page.getByRole('button', { name: 'Filters', exact: true }).tap();
  await page
    .getByRole('dialog', { name: 'Filter by' })
    .getByRole('button', { name: /^Date/ })
    .tap();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  const value = sheet.getByLabel('Value');
  await expect(value).toHaveAttribute('type', 'datetime-local');
  await value.fill('2026-09-19T10:30');
  await sheet.getByRole('button', { name: 'Apply', exact: true }).tap();

  await expect(page.getByText(/10:30:00/)).toBeVisible();
  await expect(page.getByText(/Invalid/)).toHaveCount(0);
});

test('a filtered empty list clears its search', async ({ page }) => {
  await page.goto('/books/list/Party');
  await search(page, `none ${run}`);
  await expect(page.getByText('No entries found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make Entry' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear filters' }).tap();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  await expect(page.getByText('No entries found')).toBeHidden();
});

test('an empty list offers Make Entry', async ({ page }) => {
  // Frappe serves the journal entry list and its count.
  await page.route('**/api/method/frappe.client.get_list', (route) =>
    route.request().postDataJSON().doctype === 'Books Journal Entry'
      ? route.fulfill({ json: { message: [] } })
      : route.fallback()
  );
  await page.route(
    /\/api\/v2\/doctype\/Books%20Journal%20Entry\/count\?/,
    (route) => route.fulfill({ json: { data: 0 } })
  );
  await page.goto('/books/list/JournalEntry');

  await expect(page.getByText('No entries found')).toBeVisible();
  await page.getByRole('button', { name: 'Make Entry' }).tap();
  await expect(page).toHaveURL(/\/books\/edit\/JournalEntry\//);
});

function rows(page: Page) {
  return page.getByRole('listitem').filter({ hasText: run });
}

async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'Search' }).fill(text);
}
