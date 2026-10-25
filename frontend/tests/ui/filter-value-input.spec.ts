import { expect, test, type Page } from '@playwright/test';
import {
  setupFilterFixture,
  choose,
  setValue,
  appliedFilters,
} from './helpers/filter-fixture';

setupFilterFixture();

const cases = [
  [
    'JournalEntry',
    'Entry Type',
    'voucher_type',
    [
      'Journal Entry',
      'Bank Entry',
      'Cash Entry',
      'Credit Card Entry',
      'Debit Note',
      'Credit Note',
      'Contra Entry',
      'Excise Entry',
      'Write Off Entry',
      'Opening Entry',
      'Depreciation Entry',
    ],
  ],
  ['Item', 'Type', 'item_type', ['Product', 'Service']],
  [
    'SalesInvoice',
    'Status',
    'status',
    [
      'Draft',
      'Unpaid',
      'Partly Paid',
      'Paid',
      'Return',
      'Credit Note Issued',
      'Cancelled',
    ],
  ],
  [
    'DeliveryNote',
    'Status',
    'status',
    [
      'Draft',
      'To Bill',
      'Partially Billed',
      'Completed',
      'Return',
      'Return Issued',
      'Cancelled',
    ],
  ],
] as const;

for (const [schema, label, field, options] of cases) {
  test(`${schema}.${field} offers every option and preserves selection`, async ({
    page,
  }) => {
    // The narrowest desktop window; phones get the filter sheet instead.
    if (schema === 'JournalEntry' && field === 'voucher_type')
      await page.setViewportSize({ width: 768, height: 560 });
    await openField(page, schema, label);
    const value = page.getByRole('combobox', { name: 'Value', exact: true });
    await expect(value).toHaveText('Select a value');
    await expect(
      page.getByRole('combobox', { name: 'Condition', exact: true })
    ).toHaveText('Is');
    await value.click();
    await expect(page.getByRole('option')).toHaveText([...options]);
    if (schema === 'JournalEntry' && field === 'voucher_type') {
      const menu = page.getByRole('listbox');
      await expect(menu).toBeInViewport();
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(768);
      await page.screenshot({
        path: test.info().outputPath('select-options.png'),
        animations: 'disabled',
      });
    }
    await page
      .getByRole('option', { name: options.at(-1)!, exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Filters', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('listbox')).toBeHidden();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect(await appliedFilters(page)).toEqual([[field, '=', options.at(-1)]]);
    await page
      .getByRole('button', { name: '1 filter applied', exact: true })
      .click();
    await expect(value).toHaveText(options.at(-1)!);
    await choose(page, 'Condition', 'Is Not');
    await expect(value).toHaveText(options.at(-1)!);
    await choose(page, 'Condition', 'Is Empty');
    await expect(value).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect(await appliedFilters(page)).toEqual([[field, 'is', 'not set']]);
  });
}

for (const condition of ['Is', 'Contains']) {
  test(`status ${condition} filters on the stored value`, async ({ page }) => {
    await openField(page, 'SalesInvoice', 'Status');
    await choose(page, 'Condition', condition);
    await setValue(page, 'Partly Paid');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect(await appliedFilters(page)).toEqual([
      condition === 'Is'
        ? ['status', '=', 'Partly Paid']
        : ['status', 'like', '%Partly Paid%'],
    ]);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).filterFixture.list.value.data.length
        )
      )
      .toBe(20);
  });
}

test('changing Select fields resets choices and supports keyboard selection', async ({
  page,
}) => {
  await openField(page, 'Item', 'Type');
  await setValue(page, 'Service');
  await choose(page, 'Field', 'Custom Choice');
  const value = page.getByRole('combobox', { name: 'Value', exact: true });
  await expect(value).toHaveText('Select a value');
  await value.press('Enter');
  await expect(page.getByRole('option')).toHaveText([
    'First label',
    'Second label',
  ]);
  await page
    .getByRole('option', { name: 'First label', exact: true })
    .press('ArrowDown');
  await expect(
    page.getByRole('option', { name: 'Second label', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(value).toHaveText('Second label');
  await expect(
    page.getByRole('region', { name: 'Filters', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['customChoice', '=', 'code-two'],
  ]);
});

test('Link filters offer records, search by name, clear, and use text for Contains', async ({
  page,
}) => {
  await openField(page, 'Item', 'Item Group');
  const input = page.getByRole('combobox', { name: 'Value', exact: true });
  await input.click();
  await expect(page.getByRole('option')).toHaveText([
    'ItemGroup-001',
    'ItemGroup-002',
  ]);
  await input.fill('002');
  await expect(page.getByRole('option')).toHaveText(['ItemGroup-002']);
  await page
    .getByRole('option', { name: 'ItemGroup-002', exact: true })
    .click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['item_group', '=', 'ItemGroup-002'],
  ]);
  await page
    .getByRole('button', { name: '1 filter applied', exact: true })
    .click();
  await expect(input).toHaveValue('ItemGroup-002');
  await input.fill('');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([]);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await choose(page, 'Condition', 'Contains');
  await setValue(page, 'Group');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['item_group', 'like', '%Group%'],
  ]);
});

test('Link field changes load the correct records and lookup errors are visible', async ({
  page,
}) => {
  await openField(page, 'Item', 'Item Group');
  await setValue(page, 'ItemGroup-001');
  await choose(page, 'Field', 'Default Unit of Measure');
  const input = page.getByRole('combobox', { name: 'Value', exact: true });
  await input.click();
  await expect(page.getByRole('option')).toHaveText(['UOM-001', 'UOM-002']);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    (window as any).filterFixture.state.lookupFailure = true;
  });
  await input.click();
  await expect(
    page.getByText('Unable to load options', { exact: true }).first()
  ).toBeVisible();
  expect(await appliedFilters(page)).toEqual([]);
});

test('Dynamic Link filters follow the selected type and clear stale selections', async ({
  page,
}) => {
  await openField(page, 'Quotation', 'Type');
  await setValue(page, 'Customer');
  await page.getByRole('button', { name: 'Add a filter', exact: true }).click();
  await choose(page, 'Field', 'Customer', 1);
  await setValue(page, 'Customer-001', 1);
  await setValue(page, 'Lead');
  const input = page
    .getByRole('combobox', { name: 'Value', exact: true })
    .nth(1);
  await expect(input).toHaveValue('');
  await input.click();
  await expect(page.getByRole('option')).toHaveText(['Lead-001', 'Lead-002']);
  await page.getByRole('option', { name: 'Lead-002', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['quotation_to', '=', 'Books Lead'],
    ['party_name', '=', 'Lead-002'],
  ]);
});

test('unresolved Dynamic Links allow text until their type is selected', async ({
  page,
}) => {
  await openField(page, 'Quotation', 'Customer');
  await expect(
    page.getByRole('combobox', { name: 'Value', exact: true })
  ).toHaveCount(0);
  await setValue(page, 'Known customer');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['party_name', '=', 'Known customer'],
  ]);
});

async function openField(page: Page, schema: string, label: string) {
  if (schema !== 'SalesInvoice') {
    await page.evaluate((schema) => {
      (window as any).filterFixture.state.schemaName = schema;
    }, schema);
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add a filter', exact: true }).click();
  await choose(page, 'Field', label);
}

test('custom Select fields offer every label and serialize its value', async ({
  page,
}) => {
  await openField(page, 'Item', 'Custom Choice');
  await expect(
    page.getByRole('combobox', { name: 'Value', exact: true })
  ).toHaveText('Select a value');
  await setValue(page, 'Second label');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['customChoice', '=', 'code-two'],
  ]);
});

test('Autocomplete filters offer configured suggestions and still accept text', async ({
  page,
}) => {
  await openField(page, 'Item', 'Custom Suggestion');
  await setValue(page, 'Two');
  const input = page.getByRole('combobox', { name: 'Value', exact: true });
  await input.fill('Custom text');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['customSuggestion', 'like', '%Custom text%'],
  ]);
});

test('changing a Dynamic Link type preserves implicit record restrictions', async ({
  page,
}) => {
  await openField(page, 'Quotation', 'Type');
  await page.evaluate(() => {
    (window as any).filterFixture.filter.value.addFilter(
      'party_name',
      '=',
      'Customer-001',
      true
    );
  });
  await setValue(page, 'Lead');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await appliedFilters(page)).toEqual([
    ['quotation_to', '=', 'Books Lead'],
    ['party_name', '=', 'Customer-001'],
  ]);
});
