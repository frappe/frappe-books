import { expect, test } from '@playwright/test';
import { routeAccounts } from './helpers/accounts';
import { holdOpenDoc } from './helpers/openDoc';
import { useBooksSession } from './helpers/session';

useBooksSession();

test('a Frappe-served quick edit reports post-save warnings without leaving an unsaved document', async ({
  page,
}) => {
  let writes = 0;
  // Frappe serves units; the insert is answered here so no record is stored.
  await page.route('**/api/v2/document/Books%20Uom', async (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }

    writes++;
    const values = route.request().postDataJSON();
    await route.fulfill({
      json: { data: { ...values, modified: '2026-01-01 00:00:00.000000' } },
    });
  });
  // A new unit, opened in a quick edit by the name it is kept under.
  await page.goto('/books/list/UOM');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/UOM\//);
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const router = app.config.globalProperties.$router;
    const { name } = router.currentRoute.value.params;
    return router.push({
      path: '/list/UOM',
      query: { edit: '1', schemaName: 'UOM', name },
    });
  });
  await expect(
    page.getByRole('button', { name: 'Close quick edit' })
  ).toBeVisible();
  await holdOpenDoc(page, 'UOM');
  await page.evaluate(async () => {
    const doc = (window as any).openDoc;
    const fixture = ((window as any).saveWarning = { doc, notifications: 0 });
    doc.afterSync = () => {
      throw new Error('Form refresh failed');
    };
    doc.once('afterSync', () => {
      throw new Error('Linked view failed');
    });
    doc.once('afterSync', () => {
      fixture.notifications++;
    });
    await doc.set('name', 'Warning Unit');
  });

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/was saved, but the view could not be fully updated/)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toHaveCount(0);
  expect(writes).toBe(1);
  expect(
    await page.evaluate(() => {
      const { doc, notifications } = (window as any).saveWarning;
      return { inserted: doc.inserted, dirty: doc.dirty, notifications };
    })
  ).toEqual({ inserted: true, dirty: false, notifications: 1 });
});

const PRINT_SETTINGS_URL =
  /\/api\/v2\/document\/Books%20Print%20Settings\/Books%20Print%20Settings/;

test('Print Settings report post-save warnings without leaving an unsaved document', async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  // Frappe serves the settings; the save is answered here so nothing is stored.
  await page.route(PRINT_SETTINGS_URL, async (route) => {
    if (route.request().method() !== 'PUT') {
      return route.fallback();
    }

    const values = route.request().postDataJSON();
    writes.push(values);
    await route.fulfill({
      json: {
        data: {
          ...values,
          name: 'Books Print Settings',
          modified: '2026-10-01 00:00:00.000000',
        },
      },
    });
  });
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    const router = app.config.globalProperties.$router;
    const doc = fyo.singles.PrintSettings;
    const fixture = ((window as any).saveWarning = { doc, notifications: 0 });
    doc.afterSync = () => {
      throw new Error('Form refresh failed');
    };
    doc.once('afterSync', () => {
      throw new Error('Linked view failed');
    });
    doc.once('afterSync', () => {
      fixture.notifications++;
    });
    await doc.set('display_logo', !doc.display_logo);
    await router.push({ path: '/settings', query: { tab: 'PrintSettings' } });
  });

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/was saved, but the view could not be fully updated/)
  ).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(
    await page.evaluate(() => {
      const { doc, notifications } = (window as any).saveWarning;
      return { inserted: doc.inserted, dirty: doc.dirty, notifications };
    })
  ).toEqual({ inserted: true, dirty: false, notifications: 1 });
});

test('a rejected settings save retains edits and does not offer a successful-save reload', async ({
  page,
}) => {
  await page.route(PRINT_SETTINGS_URL, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 417,
          json: {
            errors: [
              { type: 'ValidationError', message: 'Settings write rejected' },
            ],
          },
        })
      : route.fallback()
  );
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    await fyo.singles.PrintSettings.set(
      'display_logo',
      !fyo.singles.PrintSettings.display_logo
    );
    await app.config.globalProperties.$router.push({
      path: '/settings',
      query: { tab: 'PrintSettings' },
    });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const error = page
    .getByRole('dialog')
    .filter({ hasText: 'Settings write rejected' });
  await expect(error).toBeVisible();
  await error.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(
    page.getByText('Reload Frappe Books?', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeEnabled();
});

test('account tree refresh failure reports the saved account and closes the creation form', async ({
  page,
}) => {
  const root = {
    name: 'Save Test Assets',
    root_type: 'Asset',
    is_group: 1 as const,
  };
  const writes: Record<string, unknown>[] = [];
  await routeAccounts(page, [root], {
    list: (filters) => {
      if (writes.length) throw new Error('Account tree refresh failed');
      return filters.length ? [] : [root];
    },
    insert: (values) => {
      writes.push(values);
      return { ...values, name: values.account_name };
    },
  });
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    return app.config.globalProperties.$router.push('/chart-of-accounts');
  });
  await page
    .getByRole('button', { name: 'Actions for Save Test Assets', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Add Account', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form
    .getByRole('textbox', { name: 'Account name (required)', exact: true })
    .fill('Saved despite refresh');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(
      /Saved despite refresh was saved, but the view could not be fully updated/
    )
  ).toBeVisible();
  await expect(form).toHaveCount(0);
  expect(writes).toHaveLength(1);
});
