import { expect, test, type Page } from '@playwright/test';
import { serveFixture } from './fixture-server';

export function setupFilterFixture() {
  const url = serveFixture('filter-dropdown');

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2024-02-15T12:00:00') });
    await page.goto(url());
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
  });
}

export async function choose(
  page: Page,
  control: string,
  option: string,
  index = 0
) {
  await page
    .getByRole('combobox', { name: control, exact: true })
    .nth(index)
    .click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

export async function setValue(page: Page, value: string, index = 0) {
  const row = page
    .getByRole('region', { name: 'Filters', exact: true })
    .getByRole('group')
    .nth(index);
  await expect(row.getByLabel('Value', { exact: true })).toBeVisible();
  const select = row.getByRole('combobox', { name: 'Value', exact: true });
  if (await select.count()) {
    await select.click();
    await page.getByRole('option', { name: value, exact: true }).click();
  } else {
    await row.getByRole('textbox', { name: 'Value', exact: true }).fill(value);
  }
}

export async function appliedFilters(page: Page) {
  return page.evaluate(() => (window as any).filterFixture.state.applied);
}

/** The list's matching record count and the rows on its current page. */
export async function listSize(page: Page) {
  return page.evaluate(() => {
    const list = (window as any).filterFixture.list.value;
    return { total: list.total, rows: list.data.length };
  });
}
