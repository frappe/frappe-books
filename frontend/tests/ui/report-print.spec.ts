import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

useBooksSession('/books/report-print/TrialBalance');

// Both buttons opened the browser's print dialog, so only Print stays.
async function expectPrintOnly(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Print', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as PDF' })).toHaveCount(
    0
  );
}

test('the report print view offers Print and no Save as PDF', async ({
  page,
}) => {
  await expectPrintOnly(page);
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('the report print footer offers Print and no Save as PDF', async ({
    page,
  }) => {
    await expectPrintOnly(page);
  });
});

test.describe('on a phone that can share files', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const shared: string[][] = [];
      (window as any).shared = shared;
      navigator.canShare = () => true;
      navigator.share = async (data?: ShareData) => {
        shared.push(
          [...(data?.files ?? [])].map((file) => `${file.name} ${file.type}`)
        );
      };
    });
    await page.reload();
    await waitForBooks(page);
  });

  // A home-screen app could not leave the print window it opened.
  test('Print shares the PDF Frappe makes instead of opening a window', async ({
    page,
  }) => {
    let body: { html: string; orientation: string } | undefined;
    await page.route(/frappe\.utils\.print_format\.report_to_pdf/, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        body: '%PDF-1.4',
        contentType: 'application/pdf',
      });
    });
    let popups = 0;
    page.on('popup', () => (popups += 1));

    await page.getByRole('button', { name: 'Print', exact: true }).click();

    await expect
      .poll(() => page.evaluate(() => (window as any).shared))
      .toEqual([
        [expect.stringMatching(/^Trial Balance - .+\.pdf application\/pdf$/)],
      ]);
    expect(body?.orientation).toBe('Portrait');
    expect(body?.html).toContain('page-width: 210.0mm');
    expect(body?.html).toContain('<table');
    expect(popups).toBe(0);
  });
});
