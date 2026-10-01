import { expect, test } from '@playwright/test';
import { useBooksSession } from './helpers/session';

useBooksSession('/books/list/SalesInvoice');

test('the new entry shortcut opens a new document', async ({ page }) => {
  await expect(
    page.getByRole('button', { name: 'New', exact: true })
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
