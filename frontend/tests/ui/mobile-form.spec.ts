import { expect, test } from '@playwright/test';
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Value missing for' })
  ).toContainText('Customer');
  await expect(page.getByText('Customer is required')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
});
