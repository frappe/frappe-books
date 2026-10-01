import { expect, test } from '@playwright/test';
import { useBooksSession } from './helpers/session';

// Frappe serves Books Custom Form; the screen looks and fills in as before.
useBooksSession('/books/list/CustomForm/Customize%20Form');

test('a new custom field is named after its label', async ({ page }) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/CustomForm\//);

  const formType = page.getByRole('combobox', { name: 'Form Type' });
  await formType.click();
  await formType.fill('UOM');
  await page.getByRole('option', { name: 'UOM', exact: true }).click();
  await page.getByText('Add Row', { exact: true }).click();

  await page.getByRole('textbox', { name: 'Label' }).fill('Shelf Code');
  await page.keyboard.press('Tab');
  // The server's preview names the row as the form always did.
  await expect(page.getByRole('textbox', { name: 'Fieldname' })).toHaveValue(
    'shelfCode'
  );
});
