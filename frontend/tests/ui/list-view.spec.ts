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
