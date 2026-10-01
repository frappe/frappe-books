import { expect, test, type Page } from '@playwright/test';
import { insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

useBooksSession();

const preview = (page: Page) =>
  page.frameLocator('iframe[title="Print preview"]');

test('a shipped template is read-only and its duplicate edits, previews and saves', async ({
  page,
}) => {
  // The preview shows the latest payment, so one must exist.
  await insertPayment(page);
  await routeTo(page, '/template-builder/Business - Payment');
  await expect(preview(page).getByText('Amount Paid')).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'false'
  );
  await expect(
    page.getByRole('button', { name: 'Toggle Edit Mode' })
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(
    /template-builder\/Business%20-%20Payment%20CPY$/
  );
  const name = `Payment ${Date.now()}`;
  const nameField = page.locator('header input').first();
  await nameField.fill(name);
  await nameField.blur();

  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  // insertText skips the editor's bracket closing.
  await page.keyboard.insertText('<p>Signed by the cashier</p>');
  await page.keyboard.press('Control+Enter');
  await expect(preview(page).getByText('Signed by the cashier')).toBeVisible();

  await page.keyboard.insertText('{% if doc.name %}');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('Template Error')).toBeVisible();
  for (let i = 0; i < '{% if doc.name %}'.length; i++) {
    await page.keyboard.press('Backspace');
  }
  await page.keyboard.press('Control+Enter');
  await expect(preview(page).getByText('Signed by the cashier')).toBeVisible();

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(save).toHaveCount(0);
  const saved = await page.evaluate(async (name) => {
    const response = await fetch(
      `/api/resource/Print Format/${encodeURIComponent(name)}`
    );
    return (await response.json()).data;
  }, name);
  expect(saved).toMatchObject({
    doc_type: 'Books Payment',
    standard: 'No',
    custom_format: 1,
  });
  expect(saved.html).toContain('Signed by the cashier');
});

test('Set Print Size writes the page size into the template CSS', async ({
  page,
}) => {
  await routeTo(page, '/template-builder/Business - Sales Invoice');
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Set Print Size' }).click();

  const dialog = page.getByRole('dialog', { name: 'Set Print Size' });
  await dialog.getByLabel('Width (in cm)').fill('8');
  await dialog.getByLabel('Height (in cm)').fill('22');
  await dialog.getByLabel('Height (in cm)').blur();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect
    .poll(() =>
      page
        .locator('iframe[title="Print preview"]')
        .evaluate((frame) => frame.style.width)
    )
    .toBe('8cm');
});

/** Navigates in the app; a leave guard can hold the navigation open. */
async function routeTo(page: Page, path: string) {
  await page.evaluate((path) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    void app.config.globalProperties.$router.push(path);
  }, path);
  await waitForBooks(page);
}

/** A submitted payment from a new customer. */
async function insertPayment(page: Page) {
  const party = `Template Customer ${Date.now()}`;
  await insertDocument(page, 'Books Party', { name: party, role: 'Customer' });
  await insertDocument(page, 'Books Payment', {
    party,
    payment_type: 'Receive',
    payment_method: 'Cash',
    amount: 10,
    docstatus: 1,
  });
}
