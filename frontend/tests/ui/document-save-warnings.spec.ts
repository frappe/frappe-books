import { expect, test } from '@playwright/test';
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
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    return app.config.globalProperties.$router.push({
      path: '/list/UOM',
      query: { edit: '1', schemaName: 'UOM', name: 'Warning Unit' },
    });
  });
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

for (const schemaName of ['PrintSettings']) {
  test(`${schemaName} reports post-save warnings without leaving an unsaved document`, async ({
    page,
  }) => {
    await page.evaluate(async (schemaName) => {
      const app = (document.querySelector('#app') as any).__vue_app__;
      const fyo = app._context.mixins
        .find((m: any) => m.computed?.fyo)
        .computed.fyo();
      const router = app.config.globalProperties.$router;
      const doc = fyo.singles.PrintSettings;
      const fixture = ((window as any).saveWarning = {
        doc,
        writes: 0,
        notifications: 0,
        stored: null as any,
      });
      const persist = async (target: string, values: any) => {
        if (target !== schemaName)
          throw new Error(`Unexpected write to ${target}`);
        fixture.writes++;
        fixture.stored = { ...values };
        return { ...values };
      };
      fyo.db.insert = persist;
      fyo.db.update = persist;
      doc.afterSync = () => {
        throw new Error('Form refresh failed');
      };
      doc.once('afterSync', () => {
        throw new Error('Linked view failed');
      });
      doc.once('afterSync', () => {
        fixture.notifications++;
      });
      await doc.set('displayLogo', !doc.displayLogo);
      await router.push({ path: '/settings', query: { tab: schemaName } });
    }, schemaName);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText(/was saved, but the view could not be fully updated/)
    ).toBeVisible();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const { doc, writes, notifications, stored } = (window as any)
          .saveWarning;
        return {
          inserted: doc.inserted,
          dirty: doc.dirty,
          writes,
          notifications,
          savedName: stored.name,
        };
      })
    ).toMatchObject({
      inserted: true,
      dirty: false,
      writes: 1,
      notifications: 1,
    });
  });
}

test('a rejected settings save retains edits and does not offer a successful-save reload', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    await fyo.singles.PrintSettings.set(
      'displayLogo',
      !fyo.singles.PrintSettings.displayLogo
    );
    fyo.db.update = () => {
      throw new Error('Settings write rejected');
    };
    await app.config.globalProperties.$router.push({
      path: '/settings',
      query: { tab: 'PrintSettings' },
    });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const error = page.getByRole('dialog');
  await expect(error).toContainText('Settings write rejected');
  await error.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(
    page.getByText('Reload Frappe Books?', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeVisible();
});

test('account tree refresh failure reports the saved account and closes the creation form', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    const root = fyo.doc.getNewDoc('Account', {
      name: 'Save Test Assets',
      rootType: 'Asset',
      isGroup: true,
    });
    root._dirty = false;
    root._notInserted = false;
    const fixture = ((window as any).accountSave = { writes: [] as any[] });
    const getAll = fyo.db.getAll.bind(fyo.db);
    fyo.db.getAll = (schema: string, options: any) => {
      if (schema !== 'Account') return getAll(schema, options);
      if (fixture.writes.length) throw new Error('Account tree refresh failed');
      return options.filters?.parentAccount ? [] : [root.getValidDict()];
    };
    fyo.db.insert = async (schema: string, values: any) => {
      if (schema !== 'Account')
        throw new Error(`Unexpected write to ${schema}`);
      fixture.writes.push({ ...values });
      return { ...values };
    };
    await app.config.globalProperties.$router.push('/chart-of-accounts');
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
  expect(
    await page.evaluate(() => (window as any).accountSave.writes.length)
  ).toBe(1);
});
