import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves stock documents directly; the forms still look and behave as before.
useBooksSession('/books');

test.beforeEach(async ({ page }) => {
  await api(
    page,
    'PUT',
    'Books Accounting Settings/Books Accounting Settings',
    {
      enable_inventory: 1,
      enable_invoice_returns: 1,
    }
  );
  await api(page, 'PUT', 'Books Inventory Settings/Books Inventory Settings', {
    default_location: 'Stores',
  });
});

test('a stock movement takes its series, rate and locations from the server', async ({
  page,
}) => {
  const item = await insertItem(page, 'Movement Item', 12);
  await page.goto('/books/list/StockMovement');
  await waitForBooks(page);
  await page.getByRole('button', { name: 'Create new entry' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Number Series' })
  ).toHaveValue('SMOV-');

  await choose(page, 'Movement Type', 'Material Receipt');
  await page.getByText('Add Row', { exact: true }).click();
  await pickLink(page, 'Item', item);
  await expect(page.getByRole('combobox', { name: 'To' })).toHaveValue(
    'Stores'
  );
  await expect(page.getByRole('textbox', { name: 'Rate' })).toHaveValue(
    '12.00'
  );

  // An issue takes from the default location and has no destination.
  await choose(page, 'Movement Type', 'Material Issue');
  await expect(page.getByRole('combobox', { name: 'From' })).toHaveValue(
    'Stores'
  );
  await expect(page.getByRole('combobox', { name: 'To' })).toHaveValue('');

  await choose(page, 'Movement Type', 'Material Receipt');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/StockMovement\/SMOV-/);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('View Stock Entries')).toBeVisible();
});

test('a purchase receipt return keeps its quantities negative', async ({
  page,
}) => {
  const item = await insertItem(page, 'Receipt Item', 30);
  const receipt = await insertReceipt(page, item);
  await page.goto(`/books/edit/PurchaseReceipt/${receipt}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Return', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Return Against' })
  ).toHaveValue(receipt);
  const quantity = page.getByRole('textbox', { name: 'Quantity' });
  await expect(quantity).toHaveValue('-2');

  await quantity.fill('1');
  await page.keyboard.press('Tab');
  await expect(quantity).toHaveValue('-1');
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('a purchase receipt lists and opens with its rows', async ({ page }) => {
    const item = await insertItem(page, 'Phone Receipt Item', 30);
    const receipt = await insertReceipt(page, item);
    await page.goto('/books/list/PurchaseReceipt');
    await waitForBooks(page);

    await page.getByText(receipt, { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/books/edit/PurchaseReceipt/${receipt}$`)
    );
    await expect(page.getByText('2.00 × ₹ 30.00 · Stores')).toBeVisible();
  });
});

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function pickLink(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}

async function insertItem(page: Page, label: string, rate: number) {
  const name = `${label} ${Date.now()}`;
  await api(page, 'POST', 'Books Item', {
    name,
    rate,
    item_type: 'Product',
    item_usage: 'Both',
    track_item: 1,
  });
  return name;
}

/** A submitted receipt of two of the item from a new supplier. */
async function insertReceipt(page: Page, item: string) {
  const party = `Stock Supplier ${Date.now()}`;
  await api(page, 'POST', 'Books Party', { name: party, role: 'Supplier' });
  const receipt = await api(page, 'POST', 'Books Purchase Receipt', {
    party,
    items: [{ item, quantity: 2, location: 'Stores' }],
  });
  await page.evaluate(async (document) => {
    const response = await fetch('/api/v2/method/run_doc_method', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token,
      },
      body: JSON.stringify({ method: 'submit', document }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
  }, receipt);
  return receipt.name as string;
}

async function api(
  page: Page,
  method: string,
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { status, data } = await page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(`/api/v2/document/${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()).data };
    },
    { method, path, body }
  );
  expect(status).toBe(200);
  return { ...data, doctype: path.split('/')[0] };
}
