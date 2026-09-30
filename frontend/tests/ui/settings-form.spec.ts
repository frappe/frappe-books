import { expect, test } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves the settings singles; the Settings page looks and saves as before.
useBooksSession('/books/settings');

test('the System tab saves through Frappe and keeps the value after a reload', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'System' }).click();
  const bypass = page.getByRole('checkbox', {
    name: 'Allow to bypass filters',
  });
  const wasChecked = await bypass.isChecked();
  await expect(page.getByRole('combobox', { name: 'Date Format' })).toHaveValue(
    /\d{4}/
  );
  await expect(page.getByRole('textbox', { name: 'Currency' })).toBeDisabled();

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/v2/document/Books%20System%20Settings')
  );
  await bypass.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await reloaded;
  await waitForBooks(page);

  await page.getByRole('radio', { name: 'System' }).click();
  await expect(bypass).toBeChecked({ checked: !wasChecked });
  await bypass.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(bypass).toBeChecked({ checked: wasChecked });
});

test('the General tab shows the company country read only', async ({
  page,
}) => {
  await expect(page.getByRole('radio', { name: 'General' })).toBeChecked();
  const country = page.getByRole('textbox', { name: 'Country' });
  await expect(country).toBeDisabled();
  await expect(country).not.toHaveValue('');
});
