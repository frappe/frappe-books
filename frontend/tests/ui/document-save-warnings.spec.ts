import { expect, test } from '@playwright/test';
import { openBooks } from './helpers/books-session';

openBooks();

for (const schemaName of ['Color', 'PrintSettings']) {
  test(`${schemaName} reports post-save warnings without leaving an unsaved document`, async ({
    page,
  }) => {
    await page.evaluate(async (schemaName) => {
      const app = (document.querySelector('#app') as any).__vue_app__;
      const fyo = app._context.mixins
        .find((m: any) => m.computed?.fyo)
        .computed.fyo();
      const router = app.config.globalProperties.$router;
      const doc =
        schemaName === 'Color'
          ? fyo.doc.getNewDoc('Color', {
              name: 'Warning Color',
              hexvalue: '#123456',
            })
          : fyo.singles.PrintSettings;
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
      if (schemaName === 'PrintSettings') {
        await doc.set('displayLogo', !doc.displayLogo);
        await router.push({ path: '/settings', query: { tab: schemaName } });
      } else {
        await router.push({
          path: `/list/${schemaName}`,
          query: { edit: '1', schemaName, name: doc.name },
        });
      }
    }, schemaName);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText(/was saved, but the view could not be fully updated/)
    ).toBeVisible();
    if (schemaName === 'PrintSettings') {
      await page.getByRole('button', { name: 'No', exact: true }).click();
    }
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
