import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves these setup masters directly; their screens look and behave as before.
useBooksSession();

test('a new tax template saves its detail rows', async ({ page }) => {
  const name = `Form Tax ${Date.now()}`;
  await openNewEntry(page, 'Tax');
  await page
    .getByRole('textbox', { name: 'Name (required)', exact: true })
    .fill(name);
  await page.getByText('Add Row', { exact: true }).click();
  const account = page.getByRole('combobox', { name: 'Tax Invoice Account' });
  await account.fill('CGST');
  await page.getByRole('option', { name: 'CGST', exact: true }).click();
  await page.getByPlaceholder('0%').fill('9');
  await page.keyboard.press('Tab');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Tax/${encodeURIComponent(name)}$`)
  );
  const response = await page.request.get(
    `/api/v2/document/Books Tax/${encodeURIComponent(name)}`
  );
  const { data } = await response.json();
  expect(data.details.map(({ account, rate }) => [account, rate])).toEqual([
    ['CGST', 9],
  ]);
});

test('a new payment method saves with its account', async ({ page }) => {
  const name = `Form Method ${Date.now()}`;
  await openNewEntry(page, 'PaymentMethod');

  await page
    .getByRole('textbox', { name: 'Name (required)', exact: true })
    .fill(name);
  await page
    .getByRole('combobox', { name: 'Type (required)', exact: true })
    .click();
  await page.getByRole('option', { name: 'Bank', exact: true }).click();
  const account = page.getByRole('combobox', { name: 'Account', exact: true });
  await account.fill('UI Test Bank');
  await page.getByRole('option', { name: 'UI Test Bank', exact: true }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/PaymentMethod/${encodeURIComponent(name)}$`)
  );
});

test('a new currency saves under the name typed', async ({ page }) => {
  const name = `Coin ${Date.now()}`;
  await openNewEntry(page, 'Currency');

  const currencyName = page.getByRole('textbox', {
    name: 'Currency Name (required)',
    exact: true,
  });
  await expect(currencyName).toBeFocused();
  await expect(page.getByText('New Entry', { exact: true })).toBeVisible();
  await currencyName.fill(name);
  await page.getByRole('textbox', { name: 'Symbol', exact: true }).fill('C');
  await page.keyboard.press('Tab');
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Currency/${encodeURIComponent(name)}$`)
  );
  await expect(currencyName).toBeDisabled();
});

test('a new number series saves with a labelled reference type', async ({
  page,
}) => {
  const name = `NS${Date.now()}-`;
  await openNewEntry(page, 'NumberSeries');

  await page
    .getByRole('textbox', { name: 'Prefix (required)', exact: true })
    .fill(name);
  await page
    .getByRole('combobox', { name: 'Reference Type (required)' })
    .click();
  await page
    .getByRole('option', { name: 'Sales Invoice', exact: true })
    .click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/NumberSeries/${encodeURIComponent(name)}$`)
  );
  const response = await page.request.get(
    `/api/v2/document/Books Number Series/${encodeURIComponent(name)}`
  );
  const { data } = await response.json();
  expect([data.reference_type, data.current]).toEqual(['SalesInvoice', 1000]);
});

async function openNewEntry(page: Page, schemaName: string) {
  await page.goto(`/books/list/${schemaName}`);
  await waitForBooks(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/books/edit/${schemaName}/`));
}
