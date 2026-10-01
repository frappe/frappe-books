import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

useBooksSession();

test.beforeEach(async ({ page }) => {
  await page.evaluate(() =>
    (
      document.querySelector('#app') as any
    ).__vue_app__.config.globalProperties.$router.push('/edit/SalesInvoice/new')
  );
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByText('New Entry', { exact: true })
    .waitFor();
});

async function addRows(page: Page, count: number) {
  for (let row = 0; row < count; row++) {
    await page.getByText('Add Row', { exact: true }).first().click();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('button', { name: 'Edit row' })).toHaveCount(
    count
  );
}

test('invoice rows show the edit button without scrolling sideways', async ({
  page,
}) => {
  await addRows(page, 1);
  const edit = page.getByRole('button', { name: 'Edit row' });
  await expect(edit).toBeInViewport({ ratio: 1 });

  await edit.click();
  await expect(
    page.getByRole('heading', { name: 'Row 1', exact: true })
  ).toBeVisible();
  await expect(edit).toBeInViewport({ ratio: 1 });
});

test('the row editor follows its row and closes once that row is removed', async ({
  page,
}) => {
  const close = page.getByRole('button', { name: 'Close row editor' });
  const remove = page.getByRole('button', { name: 'Delete row' });
  await addRows(page, 3);

  await page.getByRole('button', { name: 'Edit row' }).nth(2).click();
  await expect(
    page.getByRole('heading', { name: 'Row 3', exact: true })
  ).toBeVisible();

  await remove.nth(0).click();
  await expect(
    page.getByRole('heading', { name: 'Row 2', exact: true })
  ).toBeVisible();
  await expect(close).toBeVisible();

  await remove.nth(1).click();
  await expect(remove).toHaveCount(1);
  await expect(close).toHaveCount(0);
});
