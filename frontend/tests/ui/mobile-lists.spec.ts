import { expect, test, type Page } from '@playwright/test';
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
  await insert(page, 'Party', {
    name: customer,
    role: 'Customer',
    phone: '98765 43210',
  });
  await insert(page, 'Party', { name: supplier, role: 'Supplier' });
  hasParties = true;
});

test('rows show two lines and open their document', async ({ page }) => {
  await page.goto('/books/list/Party');
  await expect(
    page.getByRole('button', { name: 'Create new entry' })
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
  await page.route(
    '**/api/method/frappe_books.ui_api.database_call',
    async (route) => {
      const { method, args } = route.request().postDataJSON();
      if (args?.[0] !== 'JournalEntry' || !['getAll', 'count'].includes(method))
        return route.continue();
      await route.fulfill({ json: { message: method === 'count' ? 0 : [] } });
    }
  );
  await page.goto('/books/list/JournalEntry');

  await expect(page.getByText('No entries found')).toBeVisible();
  await page.getByRole('button', { name: 'Make Entry' }).tap();
  await expect(page).toHaveURL(/\/books\/edit\/JournalEntry\//);
});

function rows(page: Page) {
  return page.getByRole('button').filter({ hasText: run });
}

async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'Search' }).fill(text);
}

async function insert(
  page: Page,
  schemaName: string,
  values: Record<string, unknown>
) {
  const response = await page.evaluate(
    async ({ schemaName, values }) => {
      const result = await fetch(
        '/api/method/frappe_books.ui_api.database_call',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token,
          },
          body: JSON.stringify({
            method: 'insert',
            args: [schemaName, values],
          }),
        }
      );
      return { ok: result.ok, text: await result.text() };
    },
    { schemaName, values }
  );
  expect(response.ok, response.text).toBe(true);
}
