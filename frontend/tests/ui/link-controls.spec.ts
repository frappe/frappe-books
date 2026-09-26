import { expect, test, type Cookie, type Page } from '@playwright/test';

const partyName = 'Audit Saved Party';
const addressName = 'Audit Address A';
const addressLabel = '103, Demo Commerce Street, Mumbai, India';
let cookies: Cookie[];

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const response = await context.request.post('/api/method/login', {
    form: {
      usr: process.env.BOOKS_TEST_USER ?? 'Administrator',
      pwd: process.env.BOOKS_TEST_PASSWORD ?? 'admin',
    },
  });
  expect(response.ok()).toBe(true);
  cookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  await page.goto('/books');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).waitFor();
  await installFixture(page);
  await openFixture(page, 'Party', partyName);
});

test('displaying and reopening a saved link does not edit the document', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.hover();
  await expect
    .poll(() => getPartyState(page))
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
  await openFixture(page, 'Party', partyName);
  await expect(address).toHaveValue(addressLabel);
  expect(await getPartyState(page)).toEqual({
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
  expect(await getPartyState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
  await address.press('Escape');
  await expect(address).toHaveValue(addressLabel);
  expect(await getPartyState(page)).toEqual({
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
    .getByRole('option', { name: 'Audit Address B', exact: true })
    .click();
  await expect(address).toHaveValue('204, Second Street, Delhi, India');
  expect(await getPartyState(page)).toEqual({
    dirty: true,
    address: 'Audit Address B',
  });
  await expect(page.getByText('Not Saved', { exact: true })).toBeVisible();
});

test('clearing a link remains a real document edit', async ({ page }) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('');
  await expect
    .poll(() => getPartyState(page))
    .toEqual({ dirty: true, address: null });
});

test('dynamic links keep display text separate from their stored IDs', async ({
  page,
}) => {
  const address = page.getByRole('combobox', {
    name: 'Related Address',
    exact: true,
  });
  await expect(address).toHaveValue(addressLabel);
  expect(await getPartyState(page)).toEqual({
    dirty: false,
    address: addressName,
  });
  await address.fill('Audit Address B');
  await page
    .getByRole('option', { name: 'Audit Address B', exact: true })
    .click();
  await expect(address).toHaveValue('204, Second Street, Delhi, India');
  expect(
    await page.evaluate(() => (window as any).linkFixture.party.linkedAddress)
  ).toBe('Audit Address B');
  expect(await getPartyState(page)).toEqual({
    dirty: true,
    address: addressName,
  });
});

test('free text autocomplete still accepts typing and option selection', async ({
  page,
}) => {
  await openFixture(page, 'Address', addressName);
  const country = page.getByRole('combobox', { name: /^Country/ });
  await country.fill('Canada');
  await expect
    .poll(() => getAddressState(page))
    .toEqual({
      dirty: true,
      country: 'Canada',
    });
  await country.press('Escape');
  await page
    .getByRole('combobox', { name: 'State', exact: true })
    .fill('New Province');
  await expect
    .poll(() => page.evaluate(() => (window as any).linkFixture.address.state))
    .toBe('New Province');
  await country.fill('Ind');
  await page.getByRole('option', { name: 'India', exact: true }).click();
  await expect(country).toHaveValue('India');
  expect(await getAddressState(page)).toEqual({
    dirty: true,
    country: 'India',
  });
});

test('creating a linked entry uses the search text without changing the saved link', async ({
  page,
}) => {
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await expect(address).toHaveValue(addressLabel);
  await address.fill('New Audit Address');
  await page.getByText('Create', { exact: true }).last().click();
  await expect(
    page.getByRole('textbox', { name: 'Address Name', exact: true })
  ).toHaveValue('New Audit Address');
  expect(await getPartyState(page)).toEqual({
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
      query: { edit: '1', schemaName: 'Party', name: 'Audit Saved Party' },
    });
  });
  const title = page.getByRole('heading', {
    name: partyName,
    exact: true,
    level: 2,
  });
  await expect(title).toBeVisible();
  const parentUrl = page.url();
  const address = page.getByRole('combobox', { name: 'Address', exact: true });
  await address.fill(partyName);
  await page.getByText('Create', { exact: true }).last().click();
  await expect(
    page.getByRole('textbox', { name: 'Address Name', exact: true })
  ).toHaveValue(partyName);
  await page.getByRole('button', { name: 'Close quick edit', exact: true }).click();
  await expect(title).toBeVisible();
  await expect(page).toHaveURL(parentUrl);
  await expect(address).toHaveValue(addressLabel);
  expect(await getPartyState(page)).toEqual({
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
      query: { edit: '1', schemaName: 'Party', name: 'Audit Saved Party' },
    });
  });
  const title = page.getByRole('heading', {
    name: partyName,
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
  await page.getByRole('menuitem', { name: 'Add Account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(title).toBeVisible();

  await page.getByRole('button', { name: 'Close quick edit', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(title).toBeHidden();
  expect(await getPartyState(page)).toEqual({ dirty: false, address: addressName });
});

test('one action opens one dismissible confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'No', exact: true }).hover();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  expect(await getPartyState(page)).toEqual({ dirty: false, address: addressName });
});

test('one notification renders once and dismisses on click', async ({ page }) => {
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins.find((m: any) => m.computed?.fyo).computed.fyo();
    fyo.singles.POSSettings.isShiftOpen = true;
    fyo.singles.POSSettings.inventory = 'Stores';
    fyo.singles.POSSettings.cashAccount = 'Fixture Cash';
    fyo.singles.POSSettings.writeOffAccount = 'Fixture Write Off';
    fyo.singles.AccountingSettings.enableCouponCode = true;
    return app.config.globalProperties.$router.push('/pos');
  });
  await expect(
    page.getByRole('button', { name: 'Coupon Code', exact: true })
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Coupon Code', exact: true }).click();
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

async function getPartyState(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).linkFixture.party;
    return { dirty: doc.dirty, address: doc.address };
  });
}

async function getAddressState(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).linkFixture.address;
    return { dirty: doc.dirty, country: doc.country };
  });
}

async function installFixture(page: Page) {
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    const addresses = [
      fyo.doc.getNewDoc('Address', {
        name: 'Audit Address A',
        addressLine1: '103, Demo Commerce Street',
        city: 'Mumbai',
        country: 'India',
        addressDisplay: '103, Demo Commerce Street, Mumbai, India',
      }),
      fyo.doc.getNewDoc('Address', {
        name: 'Audit Address B',
        addressLine1: '204, Second Street',
        city: 'Delhi',
        country: 'India',
        addressDisplay: '204, Second Street, Delhi, India',
      }),
    ];
    const partySchema = {
      ...fyo.schemaMap.Party,
      fields: [
        ...fyo.schemaMap.Party.fields,
        {
          fieldname: 'linkedType',
          fieldtype: 'Data',
          hidden: true,
          schemaName: 'Party',
        },
        {
          fieldname: 'linkedAddress',
          label: 'Related Address',
          fieldtype: 'DynamicLink',
          references: 'linkedType',
          schemaName: 'Party',
          section: 'Contacts',
        },
      ],
    };
    const party = fyo.doc.getNewDoc(
      'Party',
      {
        name: 'Audit Saved Party',
        role: 'Customer',
        address: addresses[0].name,
        linkedType: 'Address',
        linkedAddress: addresses[0].name,
      },
      true,
      partySchema
    );
    // Fixture documents exist only in this browser's cache. No records are saved.
    for (const doc of [...addresses, party]) {
      doc._dirty = false;
      doc._notInserted = false;
    }
    await party.loadLinks();
    const getAll = fyo.db.getAll.bind(fyo.db);
    fyo.db.getAll = (schemaName: string, ...args: unknown[]) => {
      if (schemaName === 'Address') {
        return addresses.map((doc: any) => ({ name: doc.name }));
      }
      return getAll(schemaName, ...args);
    };
    (window as any).linkFixture = { party, address: addresses[0] };
  });
}
