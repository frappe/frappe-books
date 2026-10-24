import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  errors,
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  loadSaved,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
registerFrappeModels({ Item: frappeModels.Item });
await loadFrappeDocTypes();

const hidden = (doc, fieldname) =>
  doc.getFieldState(doc.fieldMap[fieldname]).hidden;

test('the Item form shows the fields, labels, placeholders and sections it showed', () => {
  const layout = getSchema('Item')
    .fields.filter((field) => !field.meta)
    .map(({ fieldname, label, placeholder, section }) =>
      [fieldname, label, placeholder, section].join(' | ')
    );
  assert.deepEqual(layout, [
    'image | Image |  | Default',
    'item_code | Item Code |  | Default',
    'item_name | Item Name |  | Default',
    'item_group | Item Group | Item Group | Default',
    'item_type | Type | Type | Default',
    'stock_uom | Default Unit of Measure | Default Unit of Measure | Details',
    'standard_rate | Rate |  | Details',
    'description | Description | Item Description | Details',
    'item_defaults | Item Defaults |  | Accounts',
    'tax | Tax | Tax | Accounts',
    'gst_hsn_code | HSN/SAC | HSN/SAC Code | Inventory',
    'barcodes | Barcodes |  | Inventory',
    'is_stock_item | Maintain Stock |  | Inventory',
    'has_batch_no | Has Batch No |  | Inventory',
    'create_new_batch | Automatically Create New Batch |  | Inventory',
    'batch_number_series | Batch Number Series |  | Inventory',
    'has_serial_no | Has Serial No |  | Inventory',
    'serial_no_series | Serial Number Series |  | Inventory',
    'uoms | UOM Conversions |  | Inventory',
  ]);
  assert.deepEqual(getSchema('UOMConversionDetail').tableFields, [
    'uom',
    'conversion_factor',
  ]);
});

test('item fields hide by the item and by the features turned on', async () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  fyo.singles.InventorySettings = { enable_serial_number: true };
  const item = newFrappeDoc('Item', { item_code: 'Tea' });

  assert.equal(hidden(item, 'is_stock_item'), false);
  assert.equal(hidden(item, 'has_serial_no'), true);
  assert.equal(hidden(item, 'barcodes'), true);
  assert.equal(hidden(item, 'has_batch_no'), true);
  assert.equal(hidden(item, 'item_group'), true);
  await item.set('is_stock_item', true);
  assert.equal(hidden(item, 'has_serial_no'), false);
  assert.equal(hidden(item, 'serial_no_series'), true);
  await item.set('has_serial_no', true);
  assert.equal(hidden(item, 'serial_no_series'), false);

  await item.set('item_type', 'Service');
  assert.equal(hidden(item, 'is_stock_item'), true);
  fyo.singles.AccountingSettings = {};
  await item.set('item_type', 'Product');
  assert.equal(hidden(item, 'is_stock_item'), true);
});

test('Has Batch shows only for items that track inventory', async () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  fyo.singles.InventorySettings = { enable_batches: true };
  const item = newFrappeDoc('Item', { item_code: 'Chai' });

  assert.equal(hidden(item, 'has_batch_no'), true);
  await item.set('is_stock_item', true);
  assert.equal(hidden(item, 'has_batch_no'), false);
});

test('a saved item keeps its set-once fields and hides tracking it did not use', async () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  const item = newFrappeDoc('Item', {
    name: 'Kettle',
    item_code: 'Kettle',
    is_stock_item: false,
  });
  await loadSaved(item);
  for (const fieldname of [
    'stock_uom',
    'item_type',
    'is_stock_item',
    'has_batch_no',
  ]) {
    assert.equal(item.getFieldState(item.fieldMap[fieldname]).readOnly, true);
  }
  assert.equal(item.getFieldState(item.fieldMap.standard_rate).readOnly, false);
  assert.equal(hidden(item, 'is_stock_item'), true);
});

test('the item form shows bad values at their fields, as the server refuses them', async () => {
  fyo.singles.AccountingSettings = { country: 'India' };
  const item = newFrappeDoc('Item', { item_code: 'Mug' });
  await assert.rejects(item.set('gst_hsn_code', '12A'), errors.ValidationError);
  await assert.rejects(
    item.set('standard_rate', fyo.pesa(-1)),
    errors.ValidationError
  );
});

test('HSN/SAC shows and is checked only for an Indian company', async () => {
  fyo.singles.AccountingSettings = { country: 'United States' };
  const item = newFrappeDoc('Item', { item_code: 'Kettle' });

  assert.equal(hidden(item, 'gst_hsn_code'), true);
  await item.set('gst_hsn_code', '12A');
  fyo.singles.AccountingSettings = { country: 'India' };
  assert.equal(hidden(item, 'gst_hsn_code'), false);
  await assert.rejects(item.set('gst_hsn_code', '12B'), errors.ValidationError);
});

test('item links filter and create items by Frappe fieldnames', async () => {
  const SalesInvoiceItem = frappeModels.SalesInvoice.rowModels.items;
  const StockEntryItem = frappeModels.StockEntry.rowModels.items;
  assert.equal(SalesInvoiceItem.filters.item, undefined);
  assert.equal(SalesInvoiceItem.createFilters.item, undefined);
  assert.deepEqual(StockEntryItem.filters.item(), [['is_stock_item', '=', 1]]);
  assert.deepEqual(StockEntryItem.createFilters.item(), [
    ['is_stock_item', '=', 1],
    ['item_type', '=', 'Product'],
  ]);
});

test('item default accounts filter by the item tracking, as the server checks them', async () => {
  fyo.singles.AccountingSettings = {};
  const item = newFrappeDoc('Item', { item_code: 'Kettle' });
  await item.append('item_defaults', {});
  const [row] = item.item_defaults;
  const { filters } = frappeModels.Item.rowModels.item_defaults;

  assert.deepEqual(filters.income_account(row), [
    ['is_group', '=', 0],
    ['root_type', '=', 'Income'],
  ]);
  assert.deepEqual(filters.expense_account(row)[1], [
    'root_type',
    '=',
    'Expense',
  ]);
  await item.set('is_stock_item', true);
  assert.deepEqual(filters.expense_account(row)[1], [
    'root_type',
    '=',
    'Liability',
  ]);
  assert.equal(hidden(row, 'default_warehouse'), true);
});

test('a saved item makes both sales and purchase invoices', () => {
  const labels = (notInserted) =>
    frappeModels.Item.getActions(fyo)
      .filter(({ condition }) => condition({ notInserted }))
      .map(({ label }) => label);
  assert.deepEqual(labels(false), ['Sales Invoice', 'Purchase Invoice']);
  assert.deepEqual(labels(true), []);
});
