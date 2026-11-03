import { expect, test } from '@playwright/test';
import { useBooksSession } from './helpers/session';

// A Books User reads sales invoices but not the ledger, so Account balances is hidden.
const SALES_ONLY = {
  usr: 'books-ui-sales-only@example.com',
  pwd: 'Books-UI-Sales-Only-1',
  roles: ['Books User'],
};

const sellers = {
  items: [{ item: 'ATLAS-01', item_name: 'World Atlas', amount: 5000 }],
  total: 5000,
};

test.beforeEach(async ({ page }) => {
  await page.route(/reports\.dashboard\.get_best_sellers/, (route) =>
    route.fulfill({ json: { message: sellers } })
  );
});

useBooksSession('/books', SALES_ONLY);

// covers: AC-7, AC-9
test('without ledger access best sellers takes the left half of its row', async ({
  page,
}) => {
  const card = page.locator('[data-slot="chart-container"]', {
    hasText: 'Best sellers',
  });
  const row = card.locator('xpath=ancestor::div[contains(@class, "grid")][1]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-state', 'ready');
  await expect(page.getByText('Account balances')).toHaveCount(0);

  const [cardBox, rowBox] = await Promise.all([
    card.boundingBox(),
    row.boundingBox(),
  ]);
  expect(cardBox!.width).toBeLessThan(rowBox!.width * 0.6);
  expect(Math.abs(cardBox!.x - rowBox!.x)).toBeLessThan(2);
});
