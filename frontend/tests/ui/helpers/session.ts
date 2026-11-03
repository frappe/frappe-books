import {
  expect,
  test,
  type APIRequestContext,
  type Cookie,
  type Page,
} from '@playwright/test';

export interface Login {
  usr: string;
  pwd: string;
  /** Roles to give the user, who is created through the admin login if missing. */
  roles?: string[];
}

const adminLogin = (): Login => ({
  usr: process.env.BOOKS_TEST_USER ?? 'Administrator',
  pwd: process.env.BOOKS_TEST_PASSWORD ?? 'admin',
});

/** Signs in once per file, as `login` or the admin, and opens Books before each test. */
export function useBooksSession(path = '/books', login?: Login) {
  let cookies: Cookie[];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    if (login?.roles) {
      await signIn(context.request, adminLogin());
      await ensureUser(context.request, login);
    }
    await signIn(context.request, login ?? adminLogin());
    cookies = await context.cookies();
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(cookies);
    // Frappe adds its Flow launcher to app pages; on phones it covers Books' bottom controls.
    await page.route('**/flow_launcher.bundle*.js', (route) => route.abort());
    await page.goto(path);
    await waitForBooks(page);
  });
}

export async function waitForBooks(page: Page) {
  await page.locator('header').first().waitFor();
}

async function signIn(request: APIRequestContext, { usr, pwd }: Login) {
  const response = await request.post('/api/method/login', {
    form: { usr, pwd },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function ensureUser(request: APIRequestContext, login: Login) {
  const path = `/api/v2/document/User/${encodeURIComponent(login.usr)}`;
  if ((await request.get(path)).ok()) {
    return;
  }

  const response = await request.post('/api/v2/document/User', {
    data: {
      email: login.usr,
      first_name: login.usr.split('@')[0],
      send_welcome_email: 0,
      new_password: login.pwd,
      roles: login.roles!.map((role) => ({ role })),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
