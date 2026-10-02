import { expect, test } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

test.beforeEach(async ({ page }) => {
  await page.goto(`/books/edit/SalesInvoice/new-phone-${Date.now()}`);
  await waitForBooks(page);
});

test('saving marks missing fields in place', async ({ page }) => {
  await page
    .locator('footer')
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Value missing for' })
  ).toContainText('Customer');
  await expect(page.getByText('Customer is required')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('one header menu holds the document actions', async ({ page }) => {
  const name = `Phone Menu Customer ${Date.now()}`;
  await insertDocument(page, 'Books Party', { name, role: 'Customer' });
  await page.goto(`/books/edit/Party/${encodeURIComponent(name)}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'General Ledger' })
  ).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();

  // The safe answer names what it keeps.
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirmation = page.getByRole('dialog', { name: `Delete ${name}?` });
  await expect(
    confirmation.getByRole('button', { name: 'Delete', exact: true })
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Keep Party', exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(name)));
});

test('a link field searches full screen and creates a record in a sheet', async ({
  page,
}) => {
  const name = `Phone Customer ${Date.now()}`;
  await page.getByRole('button', { name: 'Customer', exact: true }).click();

  const picker = page.getByRole('dialog', { name: 'Customer' });
  await expect(picker).toBeVisible();
  await picker.getByPlaceholder('Search').fill(name);
  await picker.getByRole('option', { name: /Create/ }).click();

  const sheet = page.getByRole('dialog', { name: 'New Party' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(sheet).toBeHidden();
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Customer', exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('rows open in a sheet', async ({ page }) => {
  // Items is the first table on the form.
  await page.getByRole('button', { name: 'Add Row' }).first().click();

  const sheet = page.getByRole('dialog', { name: 'Row 1' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('1 row', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
});

test('rows without quick edit fields edit their table columns', async ({
  page,
}) => {
  await page.goto(`/books/edit/JournalEntry/new-phone-${Date.now()}`);
  await waitForBooks(page);
  await page.getByRole('button', { name: 'Add Row' }).first().click();

  const sheet = page.getByRole('dialog', { name: 'Row 1' });
  for (const label of ['Account', 'Debit', 'Credit']) {
    await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  }
});

test('fields before a table stay above its header', async ({ page }) => {
  await page.goto(`/books/edit/Tax/new-phone-${Date.now()}`);
  await waitForBooks(page);

  const name = page.getByRole('textbox', { name: 'Name' });
  const details = page.getByRole('heading', { name: 'Details' });
  await expect(details).toBeVisible();
  const [nameBox, detailsBox] = await Promise.all([
    name.boundingBox(),
    details.boundingBox(),
  ]);
  expect(nameBox!.y).toBeLessThan(detailsBox!.y);
});

test('a foreign-currency customer shows the exchange rate', async ({
  page,
}) => {
  const code = `Z${Date.now().toString(36).toUpperCase()}`;
  const customer = `Phone Foreign ${code}`;
  await insertDocument(page, 'Currency', {
    currency_name: code,
    symbol: code,
    enabled: 1,
  });
  await insertDocument(page, 'Books Party', {
    name: customer,
    role: 'Customer',
    currency: code,
  });

  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Customer' });
  await picker.getByPlaceholder('Search').fill(customer);
  await picker.getByRole('option', { name: customer, exact: true }).click();

  await expect(page.getByText('Exchange Rate', { exact: true })).toBeVisible();
  await expect(page.getByLabel(code, { exact: true })).toBeVisible();
});
