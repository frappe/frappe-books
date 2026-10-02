import { expect, test, type Page } from '@playwright/test';
import { routeInvoice } from './helpers/records';
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
  await routeInvoice(page, NAME);
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

test.describe('on a phone that can share files', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test.beforeEach(async ({ page }) => {
    // The first share is refused when the page asks for it, as when fetching
    // the PDF outlasted the tap.
    await page.addInitScript(() => {
      const state = { shared: [] as string[][], refuseNext: false };
      (window as any).shareState = state;
      navigator.canShare = () => true;
      navigator.share = async (data?: ShareData) => {
        if (state.refuseNext) {
          state.refuseNext = false;
          throw new DOMException('No user activation', 'NotAllowedError');
        }
        state.shared.push(
          [...(data?.files ?? [])].map((file) => `${file.name} ${file.type}`)
        );
      };
    });
    await page.reload();
    await waitForBooks(page);
  });

  test('Share hands the PDF Frappe makes to the share sheet', async ({
    page,
  }) => {
    await page.route(/frappe\.utils\.print_format\.download_pdf/, (route) =>
      route.fulfill({ body: '%PDF-1.4', contentType: 'application/pdf' })
    );
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    await expect
      .poll(() => page.evaluate(() => (window as any).shareState.shared))
      .toEqual([[`${NAME}.pdf application/pdf`]]);
  });

  test('a refused share keeps the PDF for the next tap', async ({ page }) => {
    let fetches = 0;
    await page.route(/frappe\.utils\.print_format\.download_pdf/, (route) => {
      fetches += 1;
      return route.fulfill({ body: '%PDF-1.4', contentType: 'application/pdf' });
    });
    await page.evaluate(() => ((window as any).shareState.refuseNext = true));
    const share = page.getByRole('button', { name: 'Share', exact: true });

    await share.click();
    await expect(page.getByText('PDF ready. Tap Share again.')).toBeVisible();
    await share.click();

    await expect
      .poll(() => page.evaluate(() => (window as any).shareState.shared))
      .toHaveLength(1);
    expect(fetches).toBe(1);
  });
});

/** Navigates in the app; a leave guard can hold the navigation open. */
async function routeTo(page: Page, path: string) {
  await page.evaluate((path) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    void app.config.globalProperties.$router.push(path);
  }, path);
  await waitForBooks(page);
}
