import { expect, test, type Cookie, type Page } from '@playwright/test';

/** Signs in once per file and opens Books before each test. */
export function useBooksSession(path = '/books') {
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
    await page.goto(path);
    await waitForBooks(page);
  });
}

export async function waitForBooks(page: Page) {
  await page.locator('header').first().waitFor();
}
