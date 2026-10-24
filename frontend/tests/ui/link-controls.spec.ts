import { expect, test, type Page } from '@playwright/test';
import { holdOpenDoc } from './helpers/openDoc';
import { useBooksSession } from './helpers/session';

const locationName = 'Audit Saved Location';
// Frappe names an address by its title and type; a link shows the name.
const addressName = 'Audit Address A-Billing';
const addressLabel = addressName;

useBooksSession();

test.beforeEach(async ({ page }) => {
  await installFixture(page);
  await openFixture(page, 'Location', locationName);
});

test('displaying and reopening a saved link does not edit the document', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.hover();
  await expect
    .poll(() => getLocationState(page))
    .toEqual({
      dirty: false,
      address: addressName,
    });
  await expect(page.getByText('Not Saved', { exact: true })).toBeHidden();
  await page.screenshot({
    path: test.info().outputPath('saved-link.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await openFixture(page, 'Location', locationName);
  await expect(address).toHaveValue(addressLabel);
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('searching and dismissing link options preserves the saved ID and label', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('Audit Address');
  await expect(
    page.getByRole('option', { name: 'Audit Address B' })
  ).toBeVisible();
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
  await address.press('Escape');
  await expect(address).toHaveValue(addressLabel);
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('selecting another address commits its ID and shows an unsaved edit', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('Audit Address B');
  await page
    .getByRole('option', { name: 'Audit Address B-Billing', exact: true })
    .click();
  await expect(address).toHaveValue('Audit Address B-Billing');
  expect(await getLocationState(page)).toEqual({
    dirty: true,
    address: 'Audit Address B-Billing',
  });
  await expect(page.getByText('Not Saved', { exact: true })).toBeVisible();
});

test('clearing a link remains a real document edit', async ({ page }) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('');
  await expect
    .poll(() => getLocationState(page))
    .toEqual({ dirty: true, address: null });
});

test('free text autocomplete still accepts typing', async ({ page }) => {
  await openFixture(page, 'Address', addressName);
  // Outside India the state is free text.
  await page.getByRole('combobox', { name: /^Country/ }).fill('Canad');
  await page.getByRole('option', { name: 'Canada', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'State/Province', exact: true })
    .fill('New Province');
  await expect
    .poll(async () => {
      await holdOpenDoc(page, 'Address');
      return page.evaluate(() => (window as any).openDoc.state);
    })
    .toBe('New Province');
});

test('an address country is searched and picked from the server countries', async ({
  page,
}) => {
  await openFixture(page, 'Address', addressName);
  const country = page.getByRole('combobox', { name: /^Country/ });
  await expect(country).toHaveValue('India');
  await country.fill('Canad');
  const canada = page.getByRole('option', { name: 'Canada', exact: true });
  await expect(canada).toBeVisible();
  expect(await getAddressState(page)).toEqual({
    dirty: false,
    country: 'India',
  });
  await canada.click();
  await expect(country).toHaveValue('Canada');
  expect(await getAddressState(page)).toEqual({
    dirty: true,
    country: 'Canada',
  });
});

test('creating a linked entry uses the search text without changing the saved link', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('New Audit Address');
  await page.getByRole('option', { name: /^Create/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Address Title', exact: true })
  ).toHaveValue('New Audit Address');
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('cancelling a new linked record returns to its parent quick edit', async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    return app.config.globalProperties.$router.push({
      path: '/chart-of-accounts',
      query: {
        edit: '1',
        schemaName: 'Location',
        name: 'Audit Saved Location',
      },
    });
  });
  const title = page.getByRole('heading', {
    name: locationName,
    exact: true,
    level: 2,
  });
  await expect(title).toBeVisible();
  const parentUrl = page.url();
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  // A label that loads while typing replaces the selected text.
  await expect(address).toHaveValue(addressLabel);
  await address.fill(locationName);
  await page.getByRole('option', { name: /^Create/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Address Title', exact: true })
  ).toHaveValue(locationName);
  await page
    .getByRole('button', { name: 'Close quick edit', exact: true })
    .click();
  await expect(title).toBeVisible();
  await expect(page).toHaveURL(parentUrl);
  await expect(address).toHaveValue(addressLabel);
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('Escape dismisses account menus and dialogs without closing quick edit', async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    return app.config.globalProperties.$router.push({
      path: '/chart-of-accounts',
      query: {
        edit: '1',
        schemaName: 'Location',
        name: 'Audit Saved Location',
      },
    });
  });
  const title = page.getByRole('heading', {
    name: locationName,
    exact: true,
    level: 2,
  });
  await expect(title).toBeVisible();
  const actions = page.getByRole('button', {
    name: 'Actions for Application of Funds (Assets)',
    exact: true,
  });
  await actions.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(title).toBeVisible();

  await actions.click();
  await page
    .getByRole('menuitem', { name: 'Add account', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(title).toBeVisible();

  await page
    .getByRole('button', { name: 'Close quick edit', exact: true })
    .focus();
  await page.keyboard.press('Escape');
  await expect(title).toBeHidden();
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('one action opens one dismissible confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Keep Location', exact: true })
    .hover();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  expect(await getLocationState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
});

test('one notification renders once and dismisses on click', async ({
  page,
}) => {
  // The POS opens on an open shift; these answers stand in for one.
  await page.route('**/*.get_open_shift', (route) =>
    route.fulfill({ json: { message: 'Fixture Shift' } })
  );
  await page.route(
    (url) =>
      url.pathname.endsWith('/Books%20Pos%20Opening%20Shift/Fixture%20Shift'),
    (route) =>
      route.fulfill({
        json: { data: { name: 'Fixture Shift', docstatus: 1 } },
      })
  );
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    fyo.singles.POSSettings.inventory = 'Stores';
    fyo.singles.POSSettings.cash_account = 'Fixture Cash';
    fyo.singles.POSSettings.write_off_account = 'Fixture Write Off';
    fyo.singles.AccountingSettings.enable_coupon_code = true;
    return app.config.globalProperties.$router.push('/pos');
  });
  await expect(
    page.getByRole('button', { name: 'Coupon', exact: true })
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Coupon', exact: true }).click();
  const close = page.getByRole('button', { name: 'Close toast', exact: true });
  await expect(close).toHaveCount(1);
  await close.hover();
  await close.click();
  await expect(close).toHaveCount(0);
});

async function openFixture(page: Page, schemaName: string, name: string) {
  await page.evaluate(
    ({ schemaName, name }) => {
      const app = (document.querySelector('#app') as any).__vue_app__;
      return app.config.globalProperties.$router.push(
        `/edit/${schemaName}/${encodeURIComponent(name)}`
      );
    },
    { schemaName, name }
  );
}

async function getLocationState(page: Page) {
  await holdOpenDoc(page, 'Location');
  return page.evaluate(() => {
    const doc = (window as any).openDoc;
    return { dirty: doc.dirty, address: doc.address || null };
  });
}

async function getAddressState(page: Page) {
  await holdOpenDoc(page, 'Address');
  return page.evaluate(() => {
    const doc = (window as any).openDoc;
    return { dirty: doc.dirty, country: doc.country };
  });
}

/** The saved location and addresses the tests open; Frappe serves them, so they are stored. */
async function installFixture(page: Page) {
  const addresses = [
    ['Audit Address A', '103, Demo Commerce Street', 'Mumbai'],
    ['Audit Address B', '204, Second Street', 'Delhi'],
  ];
  for (const [title, line, city] of addresses) {
    await upsert(page, 'Address', {
      name: `${title}-Billing`,
      address_title: title,
      address_type: 'Billing',
      address_line1: line,
      city,
      country: 'India',
    });
  }

  await upsert(page, 'Books Location', {
    name: locationName,
    address: addressName,
  });
}

async function upsert(
  page: Page,
  doctype: string,
  values: Record<string, unknown>
) {
  const status = await page.evaluate(
    async ({ doctype, values }) => {
      const url = `/api/v2/document/${encodeURIComponent(doctype)}`;
      const saved = `${url}/${encodeURIComponent(values.name as string)}`;
      const exists = (await fetch(saved)).ok;
      const response = await fetch(exists ? saved : url, {
        method: exists ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token,
        },
        body: JSON.stringify(values),
      });
      return response.status;
    },
    { doctype, values }
  );
  expect(status).toBe(200);
}
