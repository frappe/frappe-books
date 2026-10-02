import { expect, test, type Page } from '@playwright/test';
import { routeInvoice } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

const noConnection = (page: Page) =>
  page.getByRole('heading', { name: 'No connection' });

test('settings tabs stick, scroll sideways and keep unsaved changes', async ({
  page,
}) => {
  await routeTo(page, '/settings');
  const tabs = page.getByRole('radiogroup');
  const strip = tabs.locator('..');
  const fullName = page.getByRole('textbox', { name: 'Full Name' });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const original = await fullName.inputValue();
  await expect(save).toHaveCount(0);

  const top = (await strip.boundingBox())!.y;
  const scrolled = await page
    .locator('[data-slot="mobile-shell-scroll"]')
    .evaluate((element) => {
      element.scrollTo({ top: 600 });
      return element.scrollTop;
    });
  expect(scrolled).toBeGreaterThan(0);
  await expect.poll(async () => (await strip.boundingBox())!.y).toBe(top);

  await page.setViewportSize({ width: 240, height: 844 });
  const system = tabs.getByRole('radio', { name: 'System' });
  await system.click();
  await expect(system).toBeChecked();
  expect(await strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0
  );
  await page.setViewportSize({ width: 390, height: 844 });

  await tabs.getByRole('radio', { name: 'General' }).click();
  await fullName.fill('Unsaved Phone Name');
  await fullName.blur();
  await expect(save).toBeVisible();

  await tabs.getByRole('radio', { name: 'Print' }).click();
  await tabs.getByRole('radio', { name: 'General' }).click();
  await expect(fullName).toHaveValue('Unsaved Phone Name');

  await fullName.fill(original);
  await fullName.blur();
});

test('the offline screen covers the page until the connection returns', async ({
  page,
  context,
}) => {
  await context.setOffline(true);
  await routeTo(page, '/list/SalesInvoice');
  await expect(noConnection(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

  await context.setOffline(false);
  await expect(noConnection(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/books\/list\/SalesInvoice$/);
  await expect(page.locator('header:visible')).toContainText('Sales Invoice');
});

test('a request that cannot reach the server shows the offline screen', async ({
  page,
}) => {
  // A dashboard request answered after the cut would hide the screen again.
  await expect(page.locator('.fui-skeleton')).toHaveCount(0);
  await page.route('**/api/**', (route) =>
    route.abort('internetdisconnected')
  );
  await routeTo(page, '/list/SalesInvoice');
  await expect(noConnection(page)).toBeVisible();

  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(noConnection(page)).toHaveCount(0);
});

test('the print view has a template picker and a bottom bar', async ({
  page,
}) => {
  // The document exists only in the browser, so Frappe cannot render it.
  await page.route(/frappe\.www\.printview\.get_html_and_style/, (route) =>
    route.fulfill({
      json: { message: { html: '<p>Phone Print Test</p>', style: '' } },
    })
  );
  await routeInvoice(page, 'Phone Print Test');
  await routeTo(page, '/print/SalesInvoice/Phone Print Test');

  await expect(page.locator('header:visible')).toContainText(
    'Phone Print Test'
  );
  const picker = page.getByRole('button', { name: /^Template/ });
  await expect(picker).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Print preview"]').getByText(
      'Phone Print Test'
    )
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as PDF' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Print', exact: true })
  ).toBeVisible();

  await picker.click();
  const sheet = page.getByRole('dialog', { name: 'Print Template' });
  const options = sheet.getByRole('option');
  await expect(options.first()).toBeVisible();
  const last = options.last();
  const name = (await last.textContent())!.trim();
  await last.click();
  await expect(sheet).toHaveCount(0);
  await expect(picker).toContainText(name);
});

/** Navigates in the app; a leave guard can hold the navigation open. */
async function routeTo(page: Page, path: string) {
  await page.evaluate((path) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    void app.config.globalProperties.$router.push(path);
  }, path);
  await waitForBooks(page);
}
