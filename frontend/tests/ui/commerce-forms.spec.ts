import { expect, test, type Page } from '@playwright/test';
import { updateSingle } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves customers, their contacts and addresses, leads and pricing
// rules directly.
useBooksSession('/books/list/Customer');

test('a new customer saves its contact and address as its primary ones', async ({
  page,
}) => {
  const name = `Form Customer ${Date.now()}`;
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/Customer\//);
  await expect(
    page.getByText('Saved as the primary Contact for this customer')
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Customer Name (required)', exact: true })
    .fill(name);
  await page
    .getByRole('textbox', { name: 'Email Id', exact: true })
    .fill('asha@example.com');
  await page
    .getByRole('textbox', { name: 'Address Line 1', exact: true })
    .fill('7 Hill Road');
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Pune');
  await page
    .getByRole('combobox', { name: 'Country', exact: true })
    .fill('India');
  await page.getByRole('option', { name: 'India', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Customer/${encodeURIComponent(name)}$`)
  );

  // The saved customer shows the records the server made, as cards.
  const contact = page.locator('[data-fieldname="customer_primary_contact"]');
  const address = page.locator('[data-fieldname="customer_primary_address"]');
  await expect(contact).toContainText('asha@example.com');
  await expect(address).toContainText(`${name}-Billing`);
  await expect(address).toContainText('7 Hill Road');
  await expect(
    page.getByRole('textbox', { name: 'Email Id', exact: true })
  ).toBeHidden();
  expect(await getValue(page, 'Books Customer', name, 'email_id')).toBe(
    'asha@example.com'
  );

  await address.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Address/${encodeURIComponent(`${name}-Billing`)}$`)
  );
  await page.goBack();
  await expect(contact).toBeVisible();
});

test('a primary contact changes only to one linked to the customer', async ({
  page,
}) => {
  const name = `Card Customer ${Date.now()}`;
  await insert(page, 'Books Customer', { customer_name: name });
  for (const [first_name, links] of [
    ['Mira', [{ link_doctype: 'Books Customer', link_name: name }]],
    [`Stranger ${name}`, []],
  ] as const) {
    await insert(page, 'Contact', { first_name, links });
  }
  await page.goto(`/books/edit/Customer/${encodeURIComponent(name)}`);
  await waitForBooks(page);

  const contact = page.locator('[data-fieldname="customer_primary_contact"]');
  await expect(contact).toContainText('No primary contact');
  await contact.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Mira' })).toBeVisible();
  await expect(page.getByRole('option', { name: /^Stranger/ })).toBeHidden();
  await page.getByRole('option', { name: 'Mira' }).click();
  await expect(page.getByText('Not Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(contact).toContainText('Mira');
  expect(
    await getValue(page, 'Books Customer', name, 'customer_primary_contact')
  ).toBe(`Mira-${name}`);
});

test('a customer email is checked as Frappe checks it, with the Books message', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Email Id', exact: true })
    .fill('asha@');
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
  await insert(page, 'Books Lead', {
    lead_name: lead,
    email_id: 'lead@example.com',
  });
  await page.goto(`/books/edit/Lead/${encodeURIComponent(lead)}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Customer', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/edit/Customer/${encodeURIComponent(lead)}$`)
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

  test('a new customer saves its mobile as its primary contact', async ({
    page,
  }) => {
    const name = `Phone Customer ${Date.now()}`;
    await page.goto('/books/edit/Customer/new');
    await waitForBooks(page);
    await page.getByRole('textbox', { name: /^Customer Name/ }).fill(name);

    // Phones collapse sections that hold no value.
    await page.getByRole('button', { name: 'Contact', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Mobile No' })
      .fill('+91 98200 00000');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`${name} saved`)).toBeVisible();
    expect(await getValue(page, 'Books Customer', name, 'mobile_no')).toBe(
      '+91 98200 00000'
    );
    // A section that holds a value opens.
    await expect(
      page.locator('[data-fieldname="customer_primary_contact"]')
    ).toContainText('+91 98200 00000');
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
