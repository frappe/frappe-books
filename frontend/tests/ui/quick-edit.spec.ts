import { expect, test } from '@playwright/test';
import { routeAccounts } from './helpers/accounts';
import { useBooksSession } from './helpers/session';

const accountNames = [
  'Sidebar Account A',
  'Sidebar Account B',
  'Sidebar Account C',
];

useBooksSession();

test.beforeEach(async ({ page }) => {
  // Fixture accounts exist only in these responses, not on the site.
  const accounts = accountNames.map((name) => ({
    name,
    root_type: 'Asset',
    account_type: 'Cash',
    is_group: 0 as const,
  }));
  await routeAccounts(page, accounts);
  // The fixture accounts get full rights, as the signed-in manager has on accounts.
  await page.route('**/api/method/frappe.client.get_doc_permissions', (route) =>
    route.fulfill({
      json: {
        message: { permissions: { read: 1, write: 1, create: 1, delete: 1 } },
      },
    })
  );
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    await app.config.globalProperties.$router.push({
      path: '/chart-of-accounts',
      query: { source: 'sidebar-test' },
    });
  });
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
      expect(new URL(page.url()).searchParams.get('source')).toBe(
        'sidebar-test'
      );
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

    await page
      .getByRole('button', { name: accountNames[1], exact: true })
      .click();
    await expect(close).toBeVisible();
    await close.click();
    await expect(close).toHaveCount(0);
    await expect(page).toHaveURL(baseUrl);
  });
}
