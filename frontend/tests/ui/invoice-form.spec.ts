import { expect, test, type Page } from '@playwright/test';
import { updateSingle } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves invoices and quotes directly; the forms still look and behave as before.
useBooksSession('/books/list/SalesInvoice');

test('a new sales invoice takes its account, rows and totals from the server', async ({
  page,
}) => {
  const { party, item } = await insertParties(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/New%20Sales%20Invoice/);
  // The server fills the number series of a new invoice.
  await expect(page.getByRole('combobox', { name: 'Number Series' })).toHaveValue(
    'SINV-'
  );

  await pickLink(page, 'Customer', party);
  await expect(page.getByRole('combobox', { name: 'Account' })).toHaveValue(
    'Debtors'
  );

  await page.getByText('Add Row', { exact: true }).first().click();
  await pickLink(page, 'Item', item);
  // The first data row, after the header; Qty is its first number.
  const qty = page.getByRole('row').nth(1).getByRole('spinbutton').first();
  await qty.fill('3');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Net Total')).toHaveValue('₹ 150.00');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/SINV-\d+$/);
  await expect(page.getByText(/SINV-\d+ saved/)).toBeVisible();
});

test('a return takes back what its invoice sold', async ({ page }) => {
  await updateSingle(page, 'Books Accounting Settings', {
    enable_invoice_returns: 1,
  });
  const name = await insertSubmittedInvoice(page);
  await page.goto(`/books/edit/SalesInvoice/${name}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('menuitem', { name: 'Return' }).click();
  await expect(page.getByRole('combobox', { name: 'Return Against' })).toHaveValue(
    name
  );

  const qty = page.getByRole('row').nth(1).getByRole('spinbutton').first();
  await expect(qty).toHaveValue('-2');
  // Returns take quantities back, however they are typed.
  await qty.fill('1');
  await page.keyboard.press('Tab');
  await expect(qty).toHaveValue('-1');
});

test('a submitted quote makes an invoice with its rows', async ({ page }) => {
  const { party, item } = await insertParties(page);
  const quote = await insertDocument(page, 'Books Sales Quote', {
    reference_type: 'Books Party',
    party,
    items: [{ item, quantity: 4 }],
  });
  await runMethod(page, 'Books Sales Quote', quote, 'submit');
  await page.goto(`/books/edit/SalesQuote/${quote}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('menuitem', { name: 'Sales Invoice' }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/New/);
  await expect(page.getByRole('combobox', { name: 'Quote Reference' })).toHaveValue(
    quote
  );
  const qty = page.getByRole('row').nth(1).getByRole('spinbutton').first();
  await expect(qty).toHaveValue('4');
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('an invoice shows its rows and totals', async ({ page }) => {
    const name = await insertSubmittedInvoice(page);
    await page.goto(`/books/edit/SalesInvoice/${name}`);
    await waitForBooks(page);

    await expect(page.getByText('2.00 × ₹ 50.00')).toBeVisible();
    await expect(page.getByText('Receive Payment')).toBeVisible();
  });

  test('a payment submits from its sheet', async ({ page }) => {
    const name = await insertSubmittedInvoice(page);
    await page.goto(`/books/edit/SalesInvoice/${name}`);
    await waitForBooks(page);

    await page.getByRole('button', { name: 'Receive Payment' }).click();
    const sheet = page.getByRole('dialog', { name: 'New Payment' });
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    // The confirmation opens over the payment sheet, not behind it.
    await page.getByRole('button', { name: 'Yes', exact: true }).click();

    await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  });
});

async function pickLink(page: Page, label: string, value: string) {
  const input = page.getByRole('combobox', { name: label }).last();
  await input.click();
  await input.fill(value.slice(0, 6));
  await page.getByRole('option', { name: value }).click();
}

async function insertParties(page: Page) {
  const stamp = Date.now();
  const party = await insertDocument(page, 'Books Party', {
    name: `Invoice Customer ${stamp}`,
    role: 'Customer',
    default_account: 'Debtors',
  });
  const item = await insertDocument(page, 'Books Item', {
    name: `Invoice Item ${stamp}`,
    rate: 50,
  });
  return { party, item };
}

async function insertSubmittedInvoice(page: Page): Promise<string> {
  const { party, item } = await insertParties(page);
  const name = await insertDocument(page, 'Books Sales Invoice', {
    party,
    make_auto_payment: 0,
    make_auto_stock_transfer: 0,
    items: [{ item, quantity: 2 }],
  });
  await runMethod(page, 'Books Sales Invoice', name, 'submit');
  return name;
}

async function insertDocument(
  page: Page,
  doctype: string,
  values: Record<string, unknown>
): Promise<string> {
  const { status, name } = await page.evaluate(
    async ({ doctype, values }) => {
      const response = await fetch(`/api/v2/document/${doctype}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token,
        },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      return { status: response.status, name: body.data?.name as string };
    },
    { doctype, values }
  );
  expect(status).toBe(200);
  return name;
}

async function runMethod(
  page: Page,
  doctype: string,
  name: string,
  method: string
) {
  const status = await page.evaluate(
    async ({ doctype, name, method }) => {
      const response = await fetch(
        `/api/v2/document/${doctype}/${name}/method/${method}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token,
          },
        }
      );
      return response.status;
    },
    { doctype, name, method }
  );
  expect(status).toBe(200);
}
