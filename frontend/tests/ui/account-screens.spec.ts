import { expect, test } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves Accounts directly; the tree, list and forms look and behave as before.
useBooksSession('/books/chart-of-accounts');

test('an account added under a group takes its types and opens in quick edit', async ({
  page,
}) => {
  const name = `Tree Cash ${Date.now()}`;
  // The tree opens with its roots collapsed.
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Expand', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Actions for Cash In Hand', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Add Account', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Account name (required)', exact: true })
    .fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(
    page.getByRole('heading', { name, exact: true, level: 2 })
  ).toBeVisible();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  const response = await page.request.get(
    `/api/v2/document/Books Account/${encodeURIComponent(name)}`
  );
  const { data } = await response.json();
  expect([data.root_type, data.account_type]).toEqual(['Asset', 'Cash']);
});

test('a new root group asks for its name and root type only', async ({
  page,
}) => {
  const name = `Tree Root ${Date.now()}`;
  await page
    .getByRole('button', { name: 'Add Root Group', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Account Name', exact: true })
    .fill(name);
  await page.getByRole('combobox', { name: 'Root Type', exact: true }).click();
  await page.getByRole('option', { name: 'Asset', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(
    page.getByRole('heading', { name, exact: true, level: 2 })
  ).toBeVisible();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('the account list makes no accounts and opens one by name', async ({
  page,
}) => {
  await page.goto('/books/list/Account');
  await waitForBooks(page);
  await expect(
    page.getByRole('button', { name: 'New', exact: true })
  ).toHaveCount(0);
  await expect(page.getByText('Account Name', { exact: true })).toBeVisible();

  await page.goto('/books/edit/Account/Cash');
  await waitForBooks(page);
  const accountName = page.getByRole('textbox', {
    name: 'Account Name (required)',
    exact: true,
  });
  await expect(accountName).toHaveValue('Cash');
  await expect(accountName).toBeDisabled();
});
