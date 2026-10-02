import { expect, test, type Page } from '@playwright/test';
import { updateSingle } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves parties, addresses, leads and pricing rules directly; their
// screens still look and behave as before.
useBooksSession('/books/list/Party');

test('a new customer saves with an address made from its link', async ({
  page,
}) => {
  const name = `Form Customer ${Date.now()}`;
  const addressName = `${name} Office`;
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/Party\//);
  await page
    .getByRole('textbox', { name: 'Name (required)', exact: true })
    .fill(name);

  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await address.fill(addressName);
  await page.getByRole('option', { name: /^Create/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Address Name', exact: true })
  ).toHaveValue(addressName);
  await page
    .getByRole('textbox', { name: 'Address Line 1' })
    .fill('7 Hill Road');
  await page.getByRole('textbox', { name: 'City / Town' }).fill('Pune');
  await page.getByRole('combobox', { name: /^Country/ }).fill('India');
  await page.getByRole('option', { name: 'India', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();

  // The link shows the display text the server wrote for the new address.
  await expect(address).toHaveValue('7 Hill Road, Pune, India');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Party/${encodeURIComponent(name)}$`)
  );
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await getValue(page, 'Books Party', name, 'address')).toBe(
    addressName
  );
});

test('a party email is checked as Frappe checks it, with the Books message', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('asha@');
  await page.keyboard.press('Tab');
  await expect(
    page.getByText('Invalid email: asha@', { exact: true })
  ).toBeVisible();
});

test('a lead makes its customer through the server mapper', async ({
  page,
}) => {
  const lead = `Form Lead ${Date.now()}`;
  await updateSingle(page, 'Books Accounting Settings', { enable_lead: 1 });
  await insert(page, 'Books Lead', { name: lead, email: 'lead@example.com' });
  await page.goto(`/books/edit/Lead/${encodeURIComponent(lead)}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Customer', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Party/${encodeURIComponent(lead)}$`)
  );
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveText(
    /Customer/
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await getValue(page, 'Books Lead', lead, 'status')).toBe('Converted');
});

test('a pricing rule shows the fields of its discount scheme', async ({
  page,
}) => {
  await page.goto('/books/list/PricingRule');
  await waitForBooks(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ID' })).toBeVisible();
  await expect(page.getByText('Free Item', { exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: 'Discount Type' }).click();
  await page.getByRole('option', { name: 'Price Discount' }).click();
  await expect(page.getByText('Free Item', { exact: true })).toBeHidden();
  await page.getByRole('combobox', { name: 'Price Discount Type' }).click();
  await expect(page.getByRole('option')).toHaveText([
    'Rate',
    'Discount Percentage',
    'Discount Amount',
  ]);
});

test('a narrowed table column keeps its description on one line', async ({
  page,
}) => {
  await page.goto('/books/edit/LoyaltyProgram/new');
  await waitForBooks(page);
  const handle = page.getByRole('separator', {
    name: 'Resize Collection Factor column',
  });
  const header = handle.locator('xpath=ancestor::*[@role="columnheader"]');
  const height = (await header.boundingBox())!.height;

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x - 400, box.y + 4, { steps: 4 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow');
  expect((await header.boundingBox())!.height).toBe(height);
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('a customer saves a new phone number', async ({ page }) => {
    const name = `Phone Customer ${Date.now()}`;
    await insert(page, 'Books Party', { name, role: 'Customer' });
    await page.goto(`/books/edit/Party/${encodeURIComponent(name)}`);
    await waitForBooks(page);

    // Phones collapse sections that hold no value.
    await page.getByRole('button', { name: 'Contacts', exact: true }).click();
    await page.getByRole('textbox', { name: 'Phone' }).fill('+91 98200 00000');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`${name} saved`)).toBeVisible();
    expect(await getValue(page, 'Books Party', name, 'phone')).toBe(
      '+91 98200 00000'
    );
  });
});

async function insert(
  page: Page,
  doctype: string,
  values: Record<string, unknown>
) {
  const status = await page.evaluate(
    async ({ doctype, values }) => {
      const response = await fetch(
        `/api/v2/document/${encodeURIComponent(doctype)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token,
          },
          body: JSON.stringify(values),
        }
      );
      return response.status;
    },
    { doctype, values }
  );
  expect(status).toBe(200);
}

async function getValue(
  page: Page,
  doctype: string,
  name: string,
  fieldname: string
) {
  return page.evaluate(
    async ({ doctype, name, fieldname }) => {
      const path = [doctype, name].map(encodeURIComponent).join('/');
      const response = await fetch(`/api/v2/document/${path}`);
      const { data } = await response.json();
      return data[fieldname];
    },
    { doctype, name, fieldname }
  );
}
