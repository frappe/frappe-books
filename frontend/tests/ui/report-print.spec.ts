import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

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
