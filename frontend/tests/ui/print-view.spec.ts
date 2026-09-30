import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

useBooksSession();

const NAME = 'Desktop Print Test';

test.beforeEach(async ({ page }) => {
  // The document exists only in the browser, so Frappe's replies are stood in for.
  await page.route(/frappe\.www\.printview\.get_html_and_style/, (route) =>
    route.fulfill({
      json: {
        message: {
          html: `<p>${NAME}</p>`,
          style: '@page { size: 8cm 22cm; margin: 0; }',
        },
      },
    })
  );
  await page.evaluate((name) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((mixin: any) => mixin.computed?.fyo)
      .computed.fyo();
    fyo.doc.getNewDoc('SalesInvoice', { name });
  }, NAME);
  await routeTo(page, `/print/SalesInvoice/${NAME}`);
});

test('the print view shows the print Frappe renders at its page size', async ({
  page,
}) => {
  const preview = page.locator('iframe[title="Print preview"]');
  await expect(
    page.frameLocator('iframe[title="Print preview"]').getByText(NAME)
  ).toBeVisible();
  await expect(preview).toHaveAttribute('sandbox', /allow-same-origin/);
  expect(await preview.evaluate((frame) => frame.style.width)).toBe('8cm');
  await expect(
    page.getByRole('combobox', { name: 'Template Name' })
  ).toContainText('Business - Sales Invoice');
});

test('Save as PDF downloads the PDF Frappe makes', async ({ page }) => {
  let pdfURL = '';
  await page.route(/frappe\.utils\.print_format\.download_pdf/, (route) => {
    pdfURL = route.request().url();
    return route.fulfill({ body: '%PDF-1.4', contentType: 'application/pdf' });
  });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as PDF' }).click();

  expect((await download).suggestedFilename()).toBe(`${NAME}.pdf`);
  const params = new URL(pdfURL).searchParams;
  expect(params.get('doctype')).toBe('Books Sales Invoice');
  expect(params.get('name')).toBe(NAME);
  expect(params.get('format')).toBe('Business - Sales Invoice');
});

test('Print opens Frappe print view, which prints', async ({ page }) => {
  await page
    .context()
    .route(/\/printview\?/, (route) => route.fulfill({ body: '<html></html>' }));

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print', exact: true }).click();

  const params = new URL((await popup).url()).searchParams;
  expect(params.get('doctype')).toBe('Books Sales Invoice');
  expect(params.get('format')).toBe('Business - Sales Invoice');
  expect(params.get('trigger_print')).toBe('1');
  await expect(page.getByText('Print dialog opened')).toBeVisible();
});

/** Navigates in the app; a leave guard can hold the navigation open. */
async function routeTo(page: Page, path: string) {
  await page.evaluate((path) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    void app.config.globalProperties.$router.push(path);
  }, path);
  await waitForBooks(page);
}
