import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

const createButton = (page: Page) =>
  page
    .locator('header:visible')
    .getByRole('button', { name: 'Create', exact: true });

test('the period sheet changes the dashboard period', async ({ page }) => {
  await page.getByRole('button', { name: 'This Year' }).click();
  const sheet = page.getByRole('dialog', { name: 'Period' });
  await expect(
    sheet.getByRole('option', { name: 'This Year' })
  ).toHaveAttribute('aria-selected', 'true');

  await sheet.getByRole('option', { name: 'This Quarter' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'This Quarter' })
  ).toBeVisible();
});

test('the create menu opens a new sales invoice', async ({ page }) => {
  await createButton(page).click();
  const menu = page.getByRole('menu');
  for (const name of [
    'Sales Invoice',
    'Receive Payment',
    'Purchase Invoice',
    'Make Payment',
    'Customer',
    'Item',
  ]) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  }

  await menu.getByRole('menuitem', { name: 'Sales Invoice' }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/[^/]+$/);
});

test('a tap on a chart shows the tapped month', async ({ page }) => {
  // An empty period draws no plot, so the cashflow gets months of its own.
  const months = [1, 2, 3, 4, 5, 6].map((month) => ({
    yearmonth: `2031-0${month}`,
    inflow: month * 100,
    outflow: month * 40,
  }));
  await page.route(/reports\.dashboard\.get_cashflow/, (route) =>
    route.fulfill({ json: { message: { months, has_data: true } } })
  );
  await page.reload();

  const plot = page.locator('[data-slot="chart-container"]', {
    hasText: 'Cashflow',
  });
  await plot.scrollIntoViewIfNeeded();
  await expect(plot.locator('svg, canvas').first()).toBeVisible();
  const box = (await plot.boundingBox())!;
  const tapAt = (share: number) =>
    page.touchscreen.tap(box.x + box.width * share, box.y + box.height / 3);
  const tooltip = page.getByRole('tooltip');

  await tapAt(0.85);
  await expect(tooltip).toBeVisible();
  const reading = await tooltip.textContent();

  await tapAt(0.3);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveText(reading ?? '');
});

test('a section that fails to load can be retried', async ({ page }) => {
  let fail = true;
  await page.route(/reports\.dashboard\.get_top_expenses/, (route) =>
    fail ? route.abort() : route.continue()
  );
  await page.reload();
  await expect(page.getByText('Failed to load')).toBeVisible();

  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Failed to load')).toBeHidden();
  await expect(
    page.locator('[data-slot="chart-container"]', { hasText: 'Top Expenses' })
  ).toHaveAttribute('data-state', /ready|empty/);
});
