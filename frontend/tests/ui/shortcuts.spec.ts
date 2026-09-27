import { expect, test } from '@playwright/test';
import { useBooksSession } from './helpers/session';

useBooksSession('/books/list/SalesInvoice');

test('the new entry shortcut opens a new document', async ({ page }) => {
  await expect(
    page.getByRole('button', { name: 'Create new entry' })
  ).toBeVisible();

  await page.keyboard.press('ControlOrMeta+n');
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/New/);
});

test('the back shortcut returns to the previous page', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/New/);

  await page.keyboard.press('Shift+Backspace');
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
});

test('the print shortcut opens the print view of a saved document', async ({
  page,
}) => {
  await page.getByRole('row').nth(1).click();
  await expect(
    page.getByRole('button', { name: 'Open Print View' })
  ).toBeVisible();

  await page.keyboard.press('ControlOrMeta+p');
  await expect(page).toHaveURL(/\/books\/print\/SalesInvoice\//);
});
