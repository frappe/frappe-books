import type { Page, Route } from '@playwright/test';

export type FixtureAccount = {
  name: string;
  root_type: string;
  is_group: 0 | 1;
  parent_books_account?: string;
  account_type?: string;
};

type AccountRoutes = {
  /** Answers the tree's list requests, or throws to fail them; filters hold a parent for children. */
  list?: (filters: unknown[]) => FixtureAccount[];
  /** Answers a new account's insert with the saved values. */
  insert?: (values: Record<string, unknown>) => Record<string, unknown>;
};

const MODIFIED = '2026-09-30 10:00:00.000000';

/** Serves the Chart of Accounts and account quick edits from fixture accounts, not the site. */
export async function routeAccounts(
  page: Page,
  accounts: FixtureAccount[],
  routes: AccountRoutes = {}
) {
  await page.route('**/api/method/frappe.client.get_list', async (route) => {
    const { doctype, filters } = route.request().postDataJSON();
    if (doctype !== 'Books Account') {
      return route.fallback();
    }

    try {
      const rows = routes.list?.(filters) ?? (filters.length ? [] : accounts);
      await fulfill(route, { message: rows });
    } catch (error) {
      await route.fulfill({ status: 500, json: { exception: String(error) } });
    }
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/v2/document/Books%20Account'),
    async (route) => {
      const request = route.request();
      if (request.method() === 'POST' && routes.insert) {
        const saved = routes.insert(request.postDataJSON());
        return fulfill(route, { data: { ...saved, modified: MODIFIED } });
      }

      const name = decodeURIComponent(request.url().split('/').pop()!);
      const account = accounts.find((account) => account.name === name);
      if (request.method() !== 'GET' || !account) {
        return route.fallback();
      }

      const data = { ...account, account_name: name, modified: MODIFIED };
      await fulfill(route, { data });
    }
  );
  await page.route('**/api/v2/method/run_doc_method', async (route) => {
    const { method, document } = route.request().postDataJSON();
    if (method !== 'preview' || document.doctype !== 'Books Account') {
      return route.fallback();
    }

    await fulfill(route, { docs: [previewAccount(accounts, document)] });
  });
}

/** A new account with its group's types, as the server's preview fills them. */
function previewAccount(
  accounts: FixtureAccount[],
  document: Record<string, unknown>
) {
  const parent = accounts.find(
    (account) => account.name === document.parent_books_account
  );
  return {
    ...document,
    root_type: parent?.root_type ?? document.root_type,
    account_type: document.account_type || parent?.account_type,
  };
}

function fulfill(route: Route, body: unknown) {
  return route.fulfill({ json: body });
}
