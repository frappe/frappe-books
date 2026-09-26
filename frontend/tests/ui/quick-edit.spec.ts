import { expect, test, type Cookie } from '@playwright/test';

const accountNames = [
  'Sidebar Account A',
  'Sidebar Account B',
  'Sidebar Account C',
];
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
  await page.evaluate(async (names) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    const accounts = names.map((name) => {
      const doc = fyo.doc.getNewDoc('Account', {
        name,
        rootType: 'Asset',
        accountType: 'Cash',
        isGroup: false,
      });
      // Keep fixture accounts in the browser cache without saving records.
      doc._dirty = false;
      doc._notInserted = false;
      return doc;
    });
    const getAll = fyo.db.getAll.bind(fyo.db);
    fyo.db.getAll = (schemaName: string, ...args: unknown[]) => {
      if (schemaName === 'Account') {
        return accounts.map((doc: any) => ({
          name: doc.name,
          rootType: doc.rootType,
          accountType: doc.accountType,
          isGroup: doc.isGroup,
        }));
      }
      return getAll(schemaName, ...args);
    };
    await app.config.globalProperties.$router.push({
      path: '/chart-of-accounts',
      query: { source: 'sidebar-test' },
    });
  }, accountNames);
});

for (const closeWith of ['button', 'Escape', 'Back']) {
  test(`switching accounts needs only one ${closeWith} to close quick edit`, async ({
    page,
  }) => {
    const baseUrl = page.url();
    const close = page.getByRole('button', {
      name: 'Close quick edit',
      exact: true,
    });
    const historyPosition = await page.evaluate(
      () => window.history.state.position
    );

    for (const name of [...accountNames, accountNames[2], accountNames[0]]) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(
        page.getByRole('heading', { name, exact: true, level: 2 })
      ).toBeVisible();
      await expect(close).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get('source')).toBe('sidebar-test');
    }

    if (closeWith === 'button') {
      await close.click();
    } else if (closeWith === 'Escape') {
      await close.focus();
      await page.keyboard.press('Escape');
    } else {
      await page.goBack();
    }

    await expect(close).toHaveCount(0);
    await expect(page).toHaveURL(baseUrl);
    expect(await page.evaluate(() => window.history.state.position)).toBe(
      historyPosition
    );

    await page.getByRole('button', { name: accountNames[1], exact: true }).click();
    await expect(close).toBeVisible();
    await close.click();
    await expect(close).toHaveCount(0);
    await expect(page).toHaveURL(baseUrl);
  });
}
