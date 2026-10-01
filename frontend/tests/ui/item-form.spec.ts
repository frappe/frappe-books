import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves Items directly; the form still looks and behaves as before.
useBooksSession('/books/list/Item');

test('a new item takes its accounts from the server and saves', async ({
  page,
}) => {
  const name = `Form Item ${Date.now()}`;
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/Item\//);

  await page.getByRole('textbox', { name: 'Item Name' }).fill(name);
  await page.keyboard.press('Tab');
  // The server's preview fills the accounts a save would.
  await expect(
    page.getByRole('combobox', { name: 'Sales Acc. (required)' })
  ).toHaveValue('Sales');

  await page.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Service', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Sales Acc. (required)' })
  ).toHaveValue('Service');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Item/${encodeURIComponent(name)}$`)
  );
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('an item saves a new rate', async ({ page }) => {
    const name = `Phone Item ${Date.now()}`;
    await insertItem(page, name);
    await page.goto(`/books/edit/Item/${encodeURIComponent(name)}`);
    await waitForBooks(page);

    await page.getByRole('spinbutton', { name: 'Rate' }).fill('45');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`${name} saved`)).toBeVisible();
  });
});

async function insertItem(page: Page, name: string) {
  const status = await page.evaluate(async (name) => {
    const response = await fetch('/api/v2/document/Books Item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token,
      },
      body: JSON.stringify({ name }),
    });
    return response.status;
  }, name);
  expect(status).toBe(200);
}
