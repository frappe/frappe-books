import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves the settings singles; desktop shows them in a dialog over the dashboard.
useBooksSession('/books/settings');

const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

test('settings open over the page they were opened from', async ({ page }) => {
  await expect(page).toHaveURL(/\/books\/?$/);
  await expect(settings(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings(page)).toHaveCount(0);

  await page.goto('/books/list/SalesInvoice');
  await waitForBooks(page);
  await page.evaluate(() =>
    (
      document.querySelector('#app') as any
    ).__vue_app__.config.globalProperties.$router.push({
      path: '/settings',
      query: { tab: 'PrintSettings' },
    })
  );
  await expect(
    settings(page).getByRole('tab', { name: 'Print' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
});

test('the System tab saves through Frappe and keeps the value after a reload', async ({
  page,
}) => {
  await settings(page).getByRole('tab', { name: 'System' }).click();
  const bypass = page.getByRole('switch', {
    name: 'Allow to bypass filters',
  });
  const wasChecked = await bypass.isChecked();
  await expect(page.getByRole('combobox', { name: 'Date Format' })).toHaveValue(
    /\d{4}/
  );
  await expect(page.getByRole('textbox', { name: 'Currency' })).toBeDisabled();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/v2/document/Books%20System%20Settings')
  );
  await bypass.click();
  await save.click();
  expect((await saved).ok()).toBe(true);
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await reloaded;
  await waitForBooks(page);

  await page.goto('/books/settings?tab=SystemSettings');
  await waitForBooks(page);
  await expect(bypass).toBeChecked({ checked: !wasChecked });
  await bypass.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(bypass).toBeChecked({ checked: wasChecked });
});

test('the General tab shows the company country read only', async ({
  page,
}) => {
  await expect(
    settings(page).getByRole('tab', { name: 'General' })
  ).toHaveAttribute('aria-selected', 'true');
  const country = page.getByRole('textbox', { name: 'Country' });
  await expect(country).toBeDisabled();
  await expect(country).not.toHaveValue('');
});
