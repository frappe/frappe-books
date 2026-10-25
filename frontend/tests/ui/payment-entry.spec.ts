import { expect, test, type Page } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// The Payment Entry design: references show what each invoice owes, a transfer has no party.
useBooksSession('/books/list/PaymentEntry');

test('a transfer hides the party, the write-off and the references', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/PaymentEntry\//);
  await expect(page.getByText('Party Type', { exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: /Payment Type/ }).click();
  await page.getByRole('option', { name: 'Internal Transfer' }).click();

  for (const label of ['Party Type', 'Party', 'Write Off', 'References']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  // The mode of payment fills the account the money leaves.
  await expect(
    page.getByRole('combobox', { name: /Account Paid From/ })
  ).toHaveValue('Cash');
});

test('a reference shows the invoice total and what it owes, and a submit what is left', async ({
  page,
}) => {
  const payment = await insertPayment(page, 400);
  await page.goto(`/books/edit/PaymentEntry/${payment}`);
  await waitForBooks(page);

  // The row's amounts are inputs, read only but for a draft's allocation, named by their values.
  const row = page.getByRole('row', { name: /Open linked entry/ });
  const amount = (value: string) => row.getByRole('textbox', { name: value });
  await expect(amount('₹ 1,000.00')).toHaveCount(2);
  await expect(row.getByRole('textbox', { name: 'Allocated' })).toHaveValue(
    '400.00'
  );

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  // Outstanding is what the invoice owes after this payment.
  await expect(amount('₹ 600.00')).toBeVisible();
});

test('an allocation above what the invoice owes shows the server error', async ({
  page,
}) => {
  const payment = await insertPayment(page, 400);
  await page.goto(`/books/edit/PaymentEntry/${payment}`);
  await waitForBooks(page);

  const paid = page.getByRole('textbox', { name: /Paid Amount/ });
  await paid.fill('1500');
  await paid.press('Tab');

  const alert = page.getByRole('alert').filter({ hasText: 'Not saved' });
  await expect(alert).toContainText(
    'Row #1: Allocated Amount cannot be greater than outstanding amount.'
  );
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('a reference row reads its outstanding and allocation, and marks an error', async ({
    page,
  }) => {
    const payment = await insertPayment(page, 400);
    await page.goto(`/books/edit/PaymentEntry/${payment}`);
    await waitForBooks(page);

    const row = page.getByRole('listitem').filter({ hasText: 'Sales Invoice' });
    await expect(row).toContainText('Sales Invoice · Outstanding ₹ 1,000.00');
    await expect(row).toContainText('Allocated');

    await row.tap();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('textbox', { name: /Allocated/ }).fill('1500');
    await sheet.getByRole('button', { name: 'Done' }).tap();

    await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
    await expect(row.getByText('Error', { exact: true })).toBeVisible();
  });
});

/** A draft receipt of `amount` against a new customer's 1,000 invoice. */
async function insertPayment(page: Page, amount: number): Promise<string> {
  const stamp = Date.now();
  const customer = await insertDocument(page, 'Books Customer', {
    customer_name: `Payment Customer ${stamp}`,
  });
  const item = await insertDocument(page, 'Books Item', {
    item_code: `Payment Item ${stamp}`,
    standard_rate: 100,
  });
  const invoice = await insertDocument(page, 'Books Sales Invoice', {
    customer: customer.name,
    make_auto_payment: 0,
    make_auto_stock_transfer: 0,
    items: [{ item_code: item.name, qty: 10, price_list_rate: 100 }],
    docstatus: 1,
  });
  const payment = await insertDocument(page, 'Books Payment Entry', {
    payment_type: 'Receive',
    party_type: 'Books Customer',
    party: customer.name,
    mode_of_payment: 'Cash',
    paid_amount: amount,
    references: [
      {
        reference_doctype: 'Books Sales Invoice',
        reference_name: invoice.name,
        allocated_amount: amount,
      },
    ],
  });
  return payment.name as string;
}
