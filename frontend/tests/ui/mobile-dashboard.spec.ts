import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

useBooksSession();

const header = (page: Page) => page.locator('header:visible');
const createButton = (page: Page) =>
  page.getByRole('button', { name: 'Create', exact: true });

test('the period sheet changes the dashboard period', async ({ page }) => {
  await header(page).getByRole('button', { name: 'This Year' }).click();
  const sheet = page.getByRole('dialog', { name: 'Period' });
  await expect(
    sheet.getByRole('option', { name: 'This Year' })
  ).toHaveAttribute('aria-selected', 'true');

  await sheet.getByRole('option', { name: 'This Quarter' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    header(page).getByRole('button', { name: 'This Quarter' })
  ).toBeVisible();
});

test('the create button opens a new sales invoice', async ({ page }) => {
  await createButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Create' });
  for (const name of [
    'Sales Invoice',
    'Receive Payment',
    'Purchase Invoice',
    'Make Payment',
    'Customer',
    'Item',
  ]) {
    await expect(sheet.getByRole('button', { name })).toBeVisible();
  }
  await expect(createButton(page)).toBeHidden();

  await sheet.getByRole('button', { name: 'Sales Invoice' }).click();
  await expect(page).toHaveURL(/\/books\/edit\/SalesInvoice\/[^/]+$/);
  await expect(createButton(page)).toBeHidden();
});

test('the create button hides while the drawer is open', async ({ page }) => {
  await expect(createButton(page)).toBeVisible();
  await header(page).getByRole('button', { name: 'Menu' }).click();
  await expect(createButton(page)).toBeHidden();
});

test('a tap on a chart shows the tapped month', async ({ page }) => {
  const plot = page.locator('[data-slot="chart-container"]').first();
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
  await page.route(/bespoke_call/, (route) =>
    fail && route.request().postData()?.includes('getTopExpenses')
      ? route.abort()
      : route.continue()
  );
  await page.reload();
  await expect(page.getByText('Failed to load')).toBeVisible();

  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Failed to load')).toBeHidden();
  await expect(page.getByText('Top Expenses')).toBeVisible();
});
