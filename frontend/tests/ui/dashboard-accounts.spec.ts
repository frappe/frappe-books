import { expect, test, type Page } from '@playwright/test';
import { updateSingle } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

const CASH_BALANCES = /reports\.dashboard\.get_cash_balances/;
const SETTINGS = 'Books Accounting Settings';

const balances = {
  accounts: [{ account: 'Cash - RB', account_name: 'Cash', balance: 1500 }],
  total: 1500,
  as_of: '2031-12-15',
};

type Account = { name: string; account_name: string };

useBooksSession();

const card = (page: Page) =>
  page.locator('[data-slot="chart-container"]', {
    hasText: 'Account balances',
  });
const chooseAccounts = (page: Page) =>
  card(page).getByRole('link', { name: 'Choose accounts' });
const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

/** The first leaf account matching the filters, read as the signed-in user. */
async function getAccount(page: Page, filters: unknown[]): Promise<Account> {
  return await page.evaluate(async (filters) => {
    const query = new URLSearchParams({
      filters: JSON.stringify([['is_group', '=', 0], ...filters]),
      fields: JSON.stringify(['name', 'account_name']),
      limit: '1',
    });
    const result = await fetch(`/api/v2/document/Books Account?${query}`);
    return (await result.json()).data[0];
  }, filters);
}

async function listedAccounts(page: Page): Promise<string[]> {
  const table = card(page).getByRole('table');
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  return await table.locator('tbody').getByRole('link').allInnerTexts();
}

test.describe('the settings pick the accounts the card lists', () => {
  test.afterEach(async ({ page }) => {
    await updateSingle(page, SETTINGS, { dashboard_accounts: [] });
  });

  // covers: AC-1, AC-2, AC-4, AC-5, AC-6
  test('picked accounts replace cash and bank until the table is cleared', async ({
    page,
  }) => {
    const bank = await getAccount(page, [['account_type', '=', 'Bank']]);
    const loan = await getAccount(page, [['root_type', '=', 'Liability']]);
    const income = await getAccount(page, [['root_type', '=', 'Income']]);
    const fallback = await listedAccounts(page);
    expect(fallback.length).toBeGreaterThan(0);

    await chooseAccounts(page).click();
    await expect(
      settings(page).getByRole('tab', { name: 'General' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(settings(page).getByText('Dashboard Accounts')).toBeVisible();
    await expect(
      settings(page).getByText(
        "The accounts the dashboard's Account balances card lists. Leave empty to list every cash and bank account."
      )
    ).toBeVisible();

    await settings(page).getByText('Add row', { exact: true }).click();
    const picker = settings(page).getByRole('combobox', { name: 'Account' });
    await picker.last().click();
    await picker.last().fill(income.account_name);
    await expect(
      page.getByRole('option', { name: income.account_name })
    ).toHaveCount(0);
    await expect(page.getByRole('option', { name: /^Create/ })).toHaveCount(0);
    await picker.last().fill(bank.account_name);
    await page.getByRole('option', { name: bank.account_name }).first().click();

    await settings(page).getByText('Add row', { exact: true }).click();
    await picker.last().click();
    await picker.last().fill(loan.account_name);
    await page.getByRole('option', { name: loan.account_name }).first().click();

    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response
          .url()
          .includes('/api/v2/document/Books%20Accounting%20Settings')
    );
    await settings(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    expect((await saved).ok()).toBe(true);
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await reloaded;
    await waitForBooks(page);

    expect((await listedAccounts(page)).sort()).toEqual(
      [bank.account_name, loan.account_name].sort()
    );

    await updateSingle(page, SETTINGS, { dashboard_accounts: [] });
    await page.reload();
    await waitForBooks(page);
    expect(await listedAccounts(page)).toEqual(fallback);
  });
});

test.describe('the Choose accounts button', () => {
  let response: { status: number; body?: unknown } = { status: 200 };
  let held: Promise<void> = Promise.resolve();

  test.beforeEach(async ({ page }) => {
    response = { status: 200, body: balances };
    held = Promise.resolve();
    await page.route(CASH_BALANCES, async (route) => {
      await held;
      await (response.status === 200
        ? route.fulfill({ json: { message: response.body } })
        : route.fulfill({ status: response.status }));
    });
    await page.reload();
    await waitForBooks(page);
  });

  // covers: AC-7
  test('shows in every state of the card with its tooltip', async ({
    page,
  }) => {
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
    await expect(chooseAccounts(page)).toBeVisible();
    await chooseAccounts(page).hover();
    await expect(page.locator('[data-slot="bubble"]')).toHaveText(
      'Choose accounts'
    );

    const states = [
      ['empty', { status: 200, body: { ...balances, accounts: [] } }],
      ['error', { status: 500 }],
    ] as const;
    for (const [state, answer] of states) {
      response = answer;
      await page.reload();
      await waitForBooks(page);
      await expect(card(page)).toHaveAttribute('data-state', state);
      await expect(chooseAccounts(page)).toBeVisible();
    }

    let release = () => {};
    held = new Promise<void>((resolve) => (release = resolve));
    response = { status: 200, body: balances };
    await page.reload();
    await waitForBooks(page);
    await expect(card(page)).toHaveAttribute('data-state', 'loading');
    await expect(chooseAccounts(page)).toBeVisible();
    release();
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
  });

  // covers: AC-7
  test('opens the General tab of Settings over the dashboard', async ({
    page,
  }) => {
    await chooseAccounts(page).click();

    await expect(
      settings(page).getByRole('tab', { name: 'General' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/books\/?$/);
  });
});

test.describe('without write on Accounting Settings', () => {
  // The boot lists the doctypes the user may write; take Accounting Settings out, as for a ledger reader.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((doctype) => {
      const frappe: Record<string, unknown> = {};
      Object.defineProperty(frappe, 'boot', {
        configurable: true,
        get: () => frappe._boot,
        set(boot) {
          boot.user.can_write = boot.user.can_write.filter(
            (name: string) => name !== doctype
          );
          frappe._boot = boot;
        },
      });
      (window as unknown as { frappe: unknown }).frappe = frappe;
    }, SETTINGS);
    await page.route(CASH_BALANCES, (route) =>
      route.fulfill({ json: { message: balances } })
    );
    await page.reload();
    await waitForBooks(page);
  });

  // covers: AC-7
  test('the card has no Choose accounts button', async ({ page }) => {
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
    await expect(chooseAccounts(page)).toHaveCount(0);
  });
});
