import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

const BEST_SELLERS = /reports\.dashboard\.get_best_sellers/;

const sellers = {
  items: [
    { item: 'ATLAS-01', item_name: 'World Atlas', amount: 5000 },
    { item: 'POEMS-02', item_name: 'First Poems', amount: 3000 },
    { item: 'MAPS-03', item_name: 'Old Maps', amount: 1500 },
    { item: 'BIBLE-04', item_name: 'Family Bible', amount: 1000 },
    { item: 'NOVEL-05', item_name: 'Signed Novel', amount: 500 },
  ],
  // Items past the fifth count here but are not drawn.
  total: 12000,
};

let response: unknown = sellers;
test.beforeEach(async ({ page }) => {
  response = sellers;
  await page.route(BEST_SELLERS, (route) =>
    route.fulfill({ json: { message: response } })
  );
});

useBooksSession();

const card = (page: Page) =>
  page.locator('[data-slot="chart-container"]', { hasText: 'Best sellers' });

// covers: AC-3, AC-5
test('the card shows the top five and the total sales of every item', async ({
  page,
}) => {
  await card(page).scrollIntoViewIfNeeded();
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  // Whole amounts, so the checks hold for any site currency and precision.
  await expect(card(page)).toContainText(/Total sales: .*12,000/);
  await expect(card(page)).toContainText('Top 5');
  for (const { item_name } of sellers.items) {
    await expect(
      card(page).getByRole('button', { name: `Hide ${item_name}` })
    ).toBeVisible();
  }
  await expect(card(page)).not.toContainText('Others');
});

// covers: AC-5
test('the centre counts the items returned', async ({ page }) => {
  response = { items: sellers.items.slice(0, 3), total: 9500 };
  await page.reload();
  await card(page).scrollIntoViewIfNeeded();

  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  await expect(card(page)).toContainText('Top 3');
});

// covers: AC-6
test('changing the period reloads the best sellers', async ({ page }) => {
  const reloaded = page.waitForRequest(
    (request) =>
      BEST_SELLERS.test(request.url()) &&
      request.postData()?.includes('This Quarter') === true
  );
  await page.locator('header:visible').getByRole('combobox').click();
  await page.getByRole('option', { name: 'This quarter' }).click();
  await reloaded;
});

// covers: AC-8
test('a period without sales says so', async ({ page }) => {
  response = { items: [], total: 0 };
  await page.reload();

  await expect(card(page)).toHaveAttribute('data-state', 'empty');
  await expect(card(page)).toContainText('No sales in this period');
});

// covers: AC-8
test('best sellers that fail to load can be retried', async ({ page }) => {
  await page.unroute(BEST_SELLERS);
  let fail = true;
  await page.route(BEST_SELLERS, (route) =>
    fail
      ? route.fulfill({ status: 500 })
      : route.fulfill({ json: { message: sellers } })
  );
  await page.reload();
  await expect(card(page)).toHaveAttribute('data-state', 'error');

  fail = false;
  await card(page).getByRole('button', { name: 'Try again' }).click();
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  await expect(card(page)).toContainText('World Atlas');
});

// covers: AC-9
test('the card takes the right half of the account balances row', async ({
  page,
}) => {
  const row = card(page).locator(
    'xpath=ancestor::div[contains(@class, "grid")][1]'
  );
  await card(page).scrollIntoViewIfNeeded();
  const [cardBox, rowBox] = await Promise.all([
    card(page).boundingBox(),
    row.boundingBox(),
  ]);

  expect(cardBox!.width).toBeLessThan(rowBox!.width * 0.6);
  expect(
    Math.abs(cardBox!.x + cardBox!.width - (rowBox!.x + rowBox!.width))
  ).toBeLessThan(2);
  await expect(row).toContainText('Account balances');
});

// covers: AC-10
test('clicking a slice does not leave the dashboard', async ({ page }) => {
  const url = page.url();
  await card(page).scrollIntoViewIfNeeded();
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
  await card(page).locator('svg path').first().click({ force: true });
  // The slice also writes its name in the centre, so pick the legend entry by role.
  await card(page).getByRole('button', { name: 'Hide World Atlas' }).click();

  expect(page.url()).toBe(url);
});
