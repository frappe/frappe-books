import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  errors,
  evaluateHidden,
  evaluateReadOnly,
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
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

const hidden = (doc, fieldname) => evaluateHidden(doc.fieldMap[fieldname], doc);

test('the Item form shows the fields, labels, placeholders and sections it showed', () => {
  const layout = getSchema('Item')
    .fields.filter((field) => !field.meta)
    .map(({ fieldname, label, placeholder, section }) =>
      [fieldname, label, placeholder, section].join(' | ')
    );
  assert.deepEqual(layout, [
    'image | Image |  | Default',
    'name | Item Name | Item Name | Default',
    'item_code | Item Code | Item Code | Default',
    'item_group | Item Group | Item Group | Default',
    'item_usage | Purpose |  | Default',
    'item_type | Type | Type | Default',
    'unit | Unit Type | Unit Type | Details',
    'rate | Rate |  | Details',
    'description | Description | Item Description | Details',
    'income_account | Sales Acc. | Income | Accounts',
    'expense_account | Purchase Acc. | Expense | Accounts',
    'tax | Tax | Tax | Accounts',
    'hsn_code | HSN/SAC | HSN/SAC Code | Inventory',
    'barcode | Barcode | Barcode | Inventory',
    'track_item | Track Inventory |  | Inventory',
    'has_batch | Has Batch |  | Inventory',
    'batch_series | Batch Series |  | Inventory',
    'has_serial_number | Has Serial Number |  | Inventory',
    'serial_number_series | Serial Number Series |  | Inventory',
    'uom_conversions | UOM Conversions |  | Inventory',
  ]);
  assert.deepEqual(getSchema('UomConversionItem').tableFields, [
    'uom',
    'conversion_factor',
  ]);
});

test('item fields hide by the item and by the features turned on', async () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  fyo.singles.InventorySettings = { enable_serial_number: true };
  const item = newFrappeDoc('Item', { name: 'Tea' });

  assert.equal(hidden(item, 'track_item'), false);
  assert.equal(hidden(item, 'has_serial_number'), true);
  assert.equal(hidden(item, 'barcode'), true);
  assert.equal(hidden(item, 'has_batch'), true);
  assert.equal(hidden(item, 'item_group'), true);
  await item.set('track_item', true);
  assert.equal(hidden(item, 'has_serial_number'), false);
  assert.equal(hidden(item, 'serial_number_series'), true);
  await item.set('has_serial_number', true);
  assert.equal(hidden(item, 'serial_number_series'), false);

  await item.set('item_type', 'Service');
  assert.equal(hidden(item, 'track_item'), true);
  fyo.singles.AccountingSettings = {};
  await item.set('item_type', 'Product');
  assert.equal(hidden(item, 'track_item'), true);
  clearTimeout(item._previewTimer);
});

test('Has Batch shows only for items that track inventory', async () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  fyo.singles.InventorySettings = { enable_batches: true };
  const item = newFrappeDoc('Item', { name: 'Chai' });

  assert.equal(hidden(item, 'has_batch'), true);
  await item.set('track_item', true);
  assert.equal(hidden(item, 'has_batch'), false);
  clearTimeout(item._previewTimer);
});

test('a saved item keeps its set-once fields and hides tracking it did not use', () => {
  fyo.singles.AccountingSettings = { enable_inventory: true };
  const item = newFrappeDoc('Item', { name: 'Kettle', track_item: false });
  item._notInserted = false;
  for (const fieldname of ['unit', 'item_type', 'track_item', 'has_batch']) {
    assert.equal(evaluateReadOnly(item.fieldMap[fieldname], item), true);
  }
  assert.equal(evaluateReadOnly(item.fieldMap.rate, item), false);
  assert.equal(hidden(item, 'track_item'), true);
});

test('the item form shows bad values at their fields, as the server refuses them', async () => {
  fyo.singles.AccountingSettings = { country: 'India' };
  const item = newFrappeDoc('Item', { name: 'Mug' });
  await assert.rejects(item.set('barcode', '123'), errors.ValidationError);
  await assert.rejects(item.set('hsn_code', '12A'), errors.ValidationError);
  await assert.rejects(item.set('rate', fyo.pesa(-1)), errors.ValidationError);
  clearTimeout(item._previewTimer);
});

test('HSN/SAC shows and is checked only for an Indian company', async () => {
  fyo.singles.AccountingSettings = { country: 'United States' };
  const item = newFrappeDoc('Item', { name: 'Kettle' });

  assert.equal(hidden(item, 'hsn_code'), true);
  await item.set('hsn_code', '12A');
  fyo.singles.AccountingSettings = { country: 'India' };
  assert.equal(hidden(item, 'hsn_code'), false);
  await assert.rejects(item.set('hsn_code', '12B'), errors.ValidationError);
  clearTimeout(item._previewTimer);
});

test('item links filter and create items by Frappe fieldnames', async () => {
  const sale = { isSales: true };
  const purchase = { isSales: false };
  const SalesInvoiceItem = frappeModels.SalesInvoice.rowModels.items;
  const StockMovementItem = frappeModels.StockMovement.rowModels.items;
  assert.deepEqual(await SalesInvoiceItem.filters.item(sale), [
    ['item_usage', 'not in', ['Purchases']],
  ]);
  assert.deepEqual(await SalesInvoiceItem.createFilters.item(purchase), [
    ['item_usage', '=', 'Purchases'],
  ]);
  assert.deepEqual(StockMovementItem.filters.item(), [['track_item', '=', 1]]);
  assert.deepEqual(StockMovementItem.createFilters.item(), [
    ['track_item', '=', 1],
    ['item_type', '=', 'Product'],
  ]);
});

test('an item makes the invoices its usage allows', () => {
  const actions = frappeModels.Item.getActions(fyo);
  const labels = (usage) =>
    actions
      .filter(({ condition }) =>
        condition({ notInserted: false, item_usage: usage })
      )
      .map(({ label }) => label);
  assert.deepEqual(labels('Sales'), ['Sales Invoice']);
  assert.deepEqual(labels('Purchases'), ['Purchase Invoice']);
  assert.deepEqual(labels('Both'), ['Sales Invoice', 'Purchase Invoice']);
});
