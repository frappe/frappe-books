import { expect, type Page } from '@playwright/test';

/** Inserts a document through Frappe's REST API as the signed-in user; `docstatus: 1` submits it. */
export async function insertDocument(
  page: Page,
  doctype: string,
  values: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await page.evaluate(
    async ({ doctype, values }) => {
      const result = await fetch(`/api/v2/document/${doctype}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token,
        },
        body: JSON.stringify(values),
      });
      return { ok: result.ok, text: await result.text() };
    },
    { doctype, values }
  );
  expect(response.ok, response.text).toBe(true);
  return JSON.parse(response.text).data;
}

/** Saves values on a settings DocType (a Single), e.g. to turn on a feature a spec needs. */
export async function updateSingle(
  page: Page,
  doctype: string,
  values: Record<string, unknown>
) {
  const response = await page.evaluate(
    async ({ doctype, values }) => {
      const path = [doctype, doctype].map(encodeURIComponent).join('/');
      const result = await fetch(`/api/v2/document/${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token,
        },
        body: JSON.stringify(values),
      });
      return { ok: result.ok, text: await result.text() };
    },
    { doctype, values }
  );
  expect(response.ok, response.text).toBe(true);
}

/** The names of the first leaf accounts of a root type, e.g. Asset. */
export async function getLeafAccounts(
  page: Page,
  rootType: string
): Promise<string[]> {
  return await page.evaluate(async (rootType) => {
    const filters = JSON.stringify([
      ['is_group', '=', 0],
      ['root_type', '=', rootType],
    ]);
    const result = await fetch(
      `/api/v2/document/Books Account?filters=${encodeURIComponent(filters)}&limit=2`
    );
    const { data } = await result.json();
    return data.map(({ name }: { name: string }) => name);
  }, rootType);
}

/** Answers the read of a sales invoice that exists only in the test. */
export async function routeInvoice(page: Page, name: string) {
  const path = `/api/v2/document/Books%20Sales%20Invoice/${encodeURIComponent(name)}`;
  await page.route(
    (url) => url.pathname === path,
    (route) =>
      route.fulfill({
        json: {
          data: {
            name,
            docstatus: 1,
            is_pos: 0,
            modified: '2026-10-01 00:00:00.000000',
          },
        },
      })
  );
}
