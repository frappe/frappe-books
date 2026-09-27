import { expect, test, type Cookie } from '@playwright/test';

/** Log in once for the calling file, then open the Books app before each test. */
export function openBooks() {
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
    await page
      .getByRole('button', { name: 'Dashboard', exact: true })
      .waitFor();
  });
}
