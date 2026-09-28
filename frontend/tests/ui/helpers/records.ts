import { expect, type Page } from '@playwright/test';

/** Inserts a record through the Books database API as the signed-in user. */
export async function insert(
  page: Page,
  schemaName: string,
  values: Record<string, unknown>
) {
  const response = await page.evaluate(
    async ({ schemaName, values }) => {
      const result = await fetch(
        '/api/method/frappe_books.ui_api.database_call',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token,
          },
          body: JSON.stringify({
            method: 'insert',
            args: [schemaName, values],
          }),
        }
      );
      return { ok: result.ok, text: await result.text() };
    },
    { schemaName, values }
  );
  expect(response.ok, response.text).toBe(true);
}
