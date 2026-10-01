import { expect, test, type Page } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession } from './helpers/session';

useBooksSession('/books/import-wizard');

// Imports commit their records, so each run names its own.
const run = Date.now();

async function selectImportFile(page: Page, importType: string, csv: string) {
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: importType, exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select File', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Import Data', exact: true }).click();
}

async function getDoc(page: Page, doctype: string, name: string) {
  const response = await page.request.get(
    `/api/resource/${doctype}/${encodeURIComponent(name)}`
  );
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}

test('Frappe’s Data Import saves the rows and lists what it imported', async ({
  page,
}) => {
  const names = [`Import Ann ${run}`, `Import Bob ${run}`];
  await selectImportFile(
    page,
    'Party',
    `Name,Role,Default Account\n${names[0]},Customer,Debtors\n${names[1]},Supplier,Creditors\n`
  );

  const results = page.getByRole('dialog', { name: 'Import Complete' });
  await expect(results).toContainText('2 entries imported');
  for (const name of names) {
    await expect(results).toContainText(name);
  }
  expect((await getDoc(page, 'Books Party', names[1])).role).toBe('Supplier');
});

test('links Frappe cannot find stop the import', async ({ page }) => {
  await selectImportFile(
    page,
    'Party',
    `Name,Role,Default Account\nImport Cid ${run},Customer,Missing ${run}\n`
  );

  const error = page.getByRole('dialog', { name: 'Cannot Import' });
  await expect(error).toContainText(
    `Following links do not exist: (Account, Missing ${run}).`
  );
});

test('rows of one invoice become one submitted invoice', async ({ page }) => {
  const item = `Import Pen ${run}`;
  await insertDocument(page, 'Books Item', {
    name: item,
    item_usage: 'Both',
    rate: 10,
    income_account: 'Sales',
    expense_account: 'Cost of Goods Sold',
  });
  await insertDocument(page, 'Books Party', {
    name: `Import Dan ${run}`,
    role: 'Customer',
  });
  await selectImportFile(
    page,
    'Sales Invoice',
    [
      'Invoice No,Number Series,Customer,Account,Date,Item (Items),Quantity (Items),Rate (Items)',
      `A,SINV-,Import Dan ${run},Debtors,2026-09-30,${item},2,10`,
      `A,,,,,${item},1,5`,
    ].join('\n')
  );
  await page.getByRole('button', { name: 'Yes', exact: true }).click();

  const results = page.getByRole('dialog', { name: 'Import Complete' });
  await expect(results).toContainText('1 entry imported');
  const name = (await results.locator('p.break-words').first().textContent())!;
  const invoice = await getDoc(page, 'Books Sales Invoice', name.trim());
  expect(invoice.docstatus).toBe(1);
  expect(
    invoice.items.map((row: { quantity: number }) => row.quantity)
  ).toEqual([2, 1]);
});

test('Fix Failed keeps only the rows Frappe could not save', async ({
  page,
}) => {
  const existing = `Import Eve ${run}`;
  await insertDocument(page, 'Books Party', {
    name: existing,
    role: 'Customer',
  });
  await selectImportFile(
    page,
    'Party',
    `Name,Role\n${existing},Customer\nImport Fay ${run},Customer\n`
  );

  const results = page.getByRole('dialog', { name: 'Import Complete' });
  await expect(results).toContainText('1 entry imported');
  await expect(results).toContainText('1 entry failed');
  await expect(results).toContainText(existing);
  await results
    .getByRole('button', { name: 'Fix Failed', exact: true })
    .click();

  await expect(page.getByText('1 row added.')).toBeVisible();
  await expect(page.getByRole('textbox').first()).toHaveValue(existing);
});
