import { expect, test } from '@playwright/test';
import { useBooksSession } from './helpers/session';

// Frappe serves Tax Templates directly; the form still looks and behaves as before.
useBooksSession('/books/list/Tax');

test('a new tax template saves its detail rows', async ({ page }) => {
  const name = `Form Tax ${Date.now()}`;
  await page.getByRole('button', { name: 'Create new entry' }).click();
  await expect(page).toHaveURL(/\/books\/edit\/Tax\//);

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
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
