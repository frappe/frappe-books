import { expect, test, type Page } from '@playwright/test';
import { getLeafAccounts, insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// The invoice taxes design: a template fills the Taxes grid, the server calculates it.
useBooksSession('/books/list/SalesInvoice');

type Seed = { customer: string; item: string; template: string; vat: string };

test('a template fills the taxes, and the totals show what the server calculated', async ({
  page,
}) => {
  const seed = await seedTaxes(page);
  await fillInvoice(page, seed);

  await expect(taxRow(page, 'On Net Total')).toBeVisible();
  await expect(taxRow(page, 'Actual')).toBeVisible();
  await expect(total(page, 'net_total')).toContainText('₹ 800.00');
  await expect(total(page, 'total_taxes_and_charges')).toContainText('₹ 65.00');
  await expect(total(page, 'grand_total')).toContainText('₹ 865.00');
});

test('only an Actual charge takes an amount, and it has no rate', async ({
  page,
}) => {
  const seed = await seedTaxes(page);
  await fillInvoice(page, seed);

  // Rate, Amount, Total; the Amount of a rate's row is the server's.
  const rated = taxRow(page, 'On Net Total').getByRole('textbox');
  await expect(rated).toHaveCount(3);
  await expect(rated.nth(1)).toBeDisabled();
  // No rate cell: Amount, Total.
  const actual = taxRow(page, 'Actual').getByRole('textbox');
  await expect(actual).toHaveCount(2);
  await expect(actual.first()).toBeEnabled();
  await expect(actual.last()).toBeDisabled();
});

test('the totals say they are calculating until the server answers', async ({
  page,
}) => {
  const seed = await seedTaxes(page);
  await fillInvoice(page, seed);

  let release = () => {};
  const answered = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/run_doc_method', async (route) => {
    await answered;
    await route.continue();
  });
  const amount = taxRow(page, 'Actual').getByRole('textbox').first();
  await amount.fill('30');
  await page.keyboard.press('Tab');

  await expect(total(page, 'grand_total')).toContainText('Calculating…');
  release();
  await expect(total(page, 'grand_total')).toContainText('₹ 870.00');
});

test('a server error shows above the form and blanks the failed row', async ({
  page,
}) => {
  const seed = await seedTaxes(page);
  await fillInvoice(page, seed);

  const row = taxRow(page, 'On Net Total');
  await row.getByRole('combobox').first().click();
  await page
    .getByRole('option', { name: 'On Previous Row Amount', exact: true })
    .click();

  const alert = page.getByRole('alert').filter({ hasText: 'Not saved' });
  await expect(alert).toContainText(
    "Cannot select charge type as 'On Previous Row Amount' or 'On Previous Row Total' for first row"
  );
  await expect(
    taxRow(page, 'On Previous Row Amount').getByText('—')
  ).toHaveCount(2);
});

test('an invoice without taxes says how to add them', async ({ page }) => {
  await page.goto(`/books/edit/SalesInvoice/new-taxes-${Date.now()}`);
  await waitForBooks(page);

  await expect(
    page.getByText('No taxes. Pick a template or add a row.')
  ).toBeVisible();
  await expect(total(page, 'total_taxes_and_charges')).toContainText('₹ 0.00');
});

test('a submitted invoice names its template in the Taxes section', async ({
  page,
}) => {
  const seed = await seedTaxes(page);
  const name = await insertSubmittedInvoice(page, seed);
  await page.goto(`/books/edit/SalesInvoice/${name}`);
  await waitForBooks(page);

  await expect(
    page.getByText(`Sales Taxes and Charges Template: ${seed.template}`)
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Sales Taxes and Charges Template' })
  ).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('a tax row reads its account, type, rate, amount and running total', async ({
    page,
  }) => {
    const seed = await seedTaxes(page);
    const name = await insertSubmittedInvoice(page, seed);
    await page.goto(`/books/edit/SalesInvoice/${name}`);
    await waitForBooks(page);

    await expect(page.getByText(seed.vat, { exact: true })).toBeVisible();
    await expect(page.getByText('On Net Total · 5%')).toBeVisible();
    await expect(page.getByText('₹ 40.00', { exact: true })).toBeVisible();
    await expect(page.getByText('Total ₹ 840.00')).toBeVisible();
  });
});

/** A customer, a 400 item with a 5% item tax template, and a 5% + 25 freight template. */
async function seedTaxes(page: Page): Promise<Seed> {
  const stamp = Date.now();
  const vat = String(
    (
      await insertDocument(page, 'Books Account', {
        account_name: `Taxes VAT ${stamp}`,
        root_type: 'Liability',
        account_type: 'Tax',
        parent_account: await getGroupAccount(page, 'Liability'),
      })
    ).name
  );
  const [freight] = await getLeafAccounts(page, 'Expense');
  const itemTax = await insertDocument(page, 'Books Item Tax Template', {
    title: `Taxes VAT 5% ${stamp}`,
    taxes: [{ tax_type: vat, tax_rate: 5 }],
  });
  const template = await insertDocument(
    page,
    'Books Sales Taxes and Charges Template',
    {
      title: `Taxes VAT and freight ${stamp}`,
      taxes: [
        { charge_type: 'On Net Total', account_head: vat, rate: 5 },
        { charge_type: 'Actual', account_head: freight, tax_amount: 25 },
      ],
    }
  );
  const customer = await insertDocument(page, 'Books Customer', {
    customer_name: `Taxes Customer ${stamp}`,
    accounts: [{ account: 'Debtors' }],
  });
  const item = await insertDocument(page, 'Books Item', {
    item_code: `Taxes Item ${stamp}`,
    standard_rate: 400,
    taxes: [{ item_tax_template: itemTax.name }],
  });
  return {
    customer: String(customer.name),
    item: String(item.name),
    template: String(template.name),
    vat,
  };
}

/** A new invoice of two of the item, with the template picked. */
async function fillInvoice(page: Page, { customer, item, template }: Seed) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await pickLink(page, 'Customer', customer);
  await page.getByText('Add row', { exact: true }).first().click();
  await pickLink(page, 'Item', item);
  const qty = page.getByRole('row').nth(1).getByRole('textbox').first();
  await qty.fill('2');
  await page.keyboard.press('Tab');
  await expect(total(page, 'net_total')).toContainText('₹ 800.00');
  await pickLink(page, 'Sales Taxes and Charges Template', template);
  await expect(taxRow(page, 'Actual')).toBeVisible();
}

async function insertSubmittedInvoice(page: Page, seed: Seed) {
  const invoice = await insertDocument(page, 'Books Sales Invoice', {
    customer: seed.customer,
    taxes_and_charges: seed.template,
    make_auto_payment: 0,
    make_auto_stock_transfer: 0,
    items: [{ item_code: seed.item, qty: 2 }],
    docstatus: 1,
  });
  return String(invoice.name);
}

/** The first group account of a root type, which a new ledger account sits under. */
async function getGroupAccount(page: Page, rootType: string): Promise<string> {
  return await page.evaluate(async (rootType) => {
    const filters = JSON.stringify([
      ['is_group', '=', 1],
      ['root_type', '=', rootType],
    ]);
    const result = await fetch(
      `/api/v2/document/Books Account?filters=${encodeURIComponent(filters)}&limit=1`
    );
    return (await result.json()).data[0].name as string;
  }, rootType);
}

/** A row of the Taxes grid, by a text it shows, e.g. its type. */
function taxRow(page: Page, text: string) {
  return page.getByRole('row').filter({ hasText: text });
}

/** A line of the totals block. */
function total(page: Page, fieldname: string) {
  return page.locator(`[data-fieldname="${fieldname}"]`);
}

async function pickLink(page: Page, label: string, value: string) {
  // Item, not Item Tax Template.
  const name = new RegExp(`^${label}(?! Tax)`);
  const input = page.getByRole('combobox', { name }).last();
  await input.click();
  await input.fill(value.slice(0, 6));
  await page.getByRole('option', { name: value }).first().click();
}
