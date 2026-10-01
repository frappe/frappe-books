import { expect, test, type Locator } from '@playwright/test';
import { serveFixture } from './helpers/fixture-server';

const fixtureUrl = serveFixture('checkbox-layout');

test.beforeEach(async ({ page }) => {
  await page.goto(fixtureUrl());
  await page
    .getByRole('checkbox', { name: 'Serial Number', exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('report filters stay still when a checkbox reveals another filter', async ({
  page,
}) => {
  const checkbox = page.getByRole('checkbox', {
    name: 'Serial Number',
    exact: true,
  });
  const status = page.getByRole('combobox', { name: 'Serial Number Status' });
  for (const width of [1300, 1000]) {
    await page.setViewportSize({ width, height: 820 });
    const bounds = await checkbox.boundingBox();
    const item = page.getByRole('combobox', { name: 'Item', exact: true });
    const itemBounds = await item.boundingBox();
    for (let index = 0; index < 4; index++) {
      await checkbox.press('Space');
      await expect(checkbox).toBeChecked({ checked: index % 2 === 0 });
      if (index % 2 === 0) await expect(status).toBeVisible();
      else await expect(status).toBeHidden();
      expect(await checkbox.boundingBox()).toEqual(bounds);
      expect(await item.boundingBox()).toEqual(itemBounds);
    }
  }
});

test('a form checkbox keeps its position when its group gains or loses a checkbox', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).checkboxFixture.state.view = 'form';
  });
  const checkbox = page.getByRole('checkbox', { name: 'Track serial numbers' });
  await expect(checkbox).toBeVisible();
  const bounds = await checkbox.boundingBox();
  const barcode = page.getByRole('textbox', { name: 'Barcode' });
  const barcodeBounds = await barcode.boundingBox();
  await page.getByText('Track serial numbers', { exact: true }).click();
  await expect(checkbox).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Track batches' })
  ).toBeVisible();
  expect(await checkbox.boundingBox()).toEqual(bounds);
  expect(await barcode.boundingBox()).toEqual(barcodeBounds);
  await checkbox.press('Space');
  await expect(
    page.getByRole('checkbox', { name: 'Track batches' })
  ).toBeHidden();
  expect(await checkbox.boundingBox()).toEqual(bounds);
});

test('compact checkboxes retain their size, label, and alignment when text wraps', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).checkboxFixture.state.view = 'check';
  });
  const checkbox = page.getByRole('checkbox');
  for (const direction of ['ltr', 'rtl']) {
    await page.evaluate((dir) => {
      document.documentElement.dir = dir;
    }, direction);
    for (const size of ['small', 'large']) {
      await page.evaluate((size) => {
        (window as any).checkboxFixture.state.size = size;
      }, size);
      await expect
        .poll(async () => (await checkbox.boundingBox())?.width)
        .toBe(size === 'small' ? 14 : 16);
      await assertLabelLayout(checkbox);
      const bounds = await checkbox.boundingBox();
      await page
        .getByText(
          'Include serial numbers when exporting inventory movements',
          { exact: true }
        )
        .click();
      await expect(checkbox).toBeChecked();
      expect(await checkbox.boundingBox()).toEqual(bounds);
      await checkbox.press('Space');
      await expect(checkbox).not.toBeChecked();
    }
  }
  await page.evaluate(() => {
    (window as any).checkboxFixture.state.readOnly = true;
  });
  await expect(checkbox).toBeDisabled();
  await assertLabelLayout(checkbox);
  await page
    .getByText('Include serial numbers when exporting inventory movements', {
      exact: true,
    })
    .click({ force: true });
  await expect(checkbox).not.toBeChecked();
  await page.evaluate(() => {
    (window as any).checkboxFixture.state.showLabel = false;
  });
  await expect(checkbox).toHaveAccessibleName(
    'Include serial numbers when exporting inventory movements'
  );
});

async function assertLabelLayout(checkbox: Locator) {
  const layout = await checkbox.evaluate((input: HTMLInputElement) => {
    const bounds = input.getBoundingClientRect();
    const label = input.labels![0].getBoundingClientRect();
    const container = input.closest('.books-check')!.getBoundingClientRect();
    return {
      top: bounds.top - label.top,
      fits: label.left >= container.left && label.right <= container.right,
      wraps: label.height > bounds.height,
    };
  });
  expect(layout.top).toBeLessThanOrEqual(2);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.fits).toBe(true);
  expect(layout.wraps).toBe(true);
}
