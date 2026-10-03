import { expect, test, type Page } from '@playwright/test';
import { useBooksSession, waitForBooks } from './helpers/session';

useBooksSession('/books/report/GeneralLedger');

const range = (page: Page) => page.getByPlaceholder('Date range');

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

test('a link filter opens from a pill, searches inside and clears', async ({
  page,
}) => {
  const account = page
    .getByRole('group', { name: 'Filters', exact: true })
    .getByRole('combobox', { name: 'Account', exact: true });
  await expect(account).toHaveText(/All/);
  await account.click();
  await page.getByPlaceholder('Search', { exact: true }).fill('Debtors');
  await page.getByRole('option', { name: 'Debtors', exact: true }).click();
  await expect(account).toHaveText(/Debtors/);

  await account.click();
  await expect(page.getByPlaceholder('Search', { exact: true })).toHaveValue(
    ''
  );
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(account).toHaveText(/All/);
});

test('typing in a pill search does not set the filter until an option is picked', async ({
  page,
}) => {
  await page.goto('/books/report/GSTR2');
  await waitForBooks(page);
  const place = page
    .getByRole('group', { name: 'Filters', exact: true })
    .getByRole('combobox', { name: 'Place', exact: true });
  await place.click();
  await page.getByPlaceholder('Search', { exact: true }).fill('mah');
  await expect(place).toHaveText(/All/);
  await page.getByRole('option', { name: 'Maharashtra', exact: true }).click();
  await expect(place).toHaveText(/Maharashtra/);
});

test('inline filter labels share one size and sit beside their values', async ({
  page,
}) => {
  await page.goto('/books/report/BalanceSheet');
  await waitForBooks(page);
  const filters = page.getByRole('group', { name: 'Filters', exact: true });
  const fontSize = (label: string) =>
    filters
      .getByText(label, { exact: true })
      .evaluate((node) => getComputedStyle(node).fontSize);

  const selectLabelSize = await fontSize('Based On');
  for (const label of ['To Date', 'Number of Months']) {
    expect(await fontSize(label)).toBe(selectLabelSize);
  }
  const months = filters.getByRole('textbox', { name: 'Number of Months' });
  expect(
    await months.evaluate((node) => getComputedStyle(node).textAlign)
  ).not.toBe('end');
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
