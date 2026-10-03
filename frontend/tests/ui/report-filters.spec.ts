import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

useBooksSession('/books/report/GeneralLedger');

const range = (page: Page) => page.getByPlaceholder('Date Range');

async function closeWithoutChoice(page: Page, close: () => Promise<void>) {
  const value = await range(page).inputValue();
  await range(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await close();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(range(page)).toHaveValue(value);
}

test('closing the date range without a choice keeps the range', async ({
  page,
}) => {
  await expect(range(page)).not.toHaveValue('');
  await closeWithoutChoice(page, () => page.keyboard.press('Escape'));
  await closeWithoutChoice(page, () =>
    page.getByRole('heading', { name: 'General Ledger' }).click()
  );
});

test('a preset shows its whole range and keeps it on close', async ({
  page,
}) => {
  // The range shows dates in the Books date format, which setup takes from the country.
  await page.route(
    '**/api/v2/document/Books%20System%20Settings/**',
    async (route) => {
      const json = await (await route.fetch()).json();
      json.data.date_format = 'MMM d, y';
      await route.fulfill({ json });
    }
  );
  await page.reload();
  await waitForBooks(page);
  await page.clock.setFixedTime(new Date(2026, 9, 3, 12));
  await range(page).click();
  await page.getByRole('button', { name: 'Last month' }).click();
  await expect(range(page)).toHaveValue('Sep 01 2026 to Sep 30 2026');
  await closeWithoutChoice(page, () => page.keyboard.press('Escape'));
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('the Filters sheet keeps Clear and Apply on screen', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /^Filters/ }).click();
    for (const name of ['Clear', 'Apply']) {
      await expect(
        page.getByRole('dialog').getByRole('button', { name, exact: true })
      ).toBeInViewport({ ratio: 1 });
    }
  });
});
