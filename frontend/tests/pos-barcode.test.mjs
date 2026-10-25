import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findScannedPOSItem } from './helpers/accounting.mjs';
import { POS, fyo, posItemSearch, stubFrappe } from './helpers/frappe.mjs';

const rice = {
  name: 'Basmati Rice',
  barcodes: ['12345', '890000000001'],
  unit: 'Kg',
};
const eggs = { name: 'Eggs', barcodes: ['54321'], unit: 'Unit' };
const items = [rice, eggs];
const riceRow = {
  name: 'Basmati Rice',
  barcodes: [{ barcode: '12345' }, { barcode: '890000000001' }],
  stock_uom: 'Kg',
  standard_rate: 80,
  is_stock_item: 1,
};
const scale = {
  weight_enabled_barcode: true,
  check_digits: 21,
  item_code_digits: 5,
  item_weight_digits: 5,
};

test('a scale barcode adds its weight, in kilograms for kg items', () => {
  assert.deepEqual(findScannedPOSItem(items, '211234501500', scale), {
    item: rice,
    quantity: 1.5,
    isStockQuantity: true,
  });
  assert.deepEqual(findScannedPOSItem(items, '215432100012', scale), {
    item: eggs,
    quantity: 12,
    isStockQuantity: true,
  });
});

test('other codes match a 12 digit barcode or an exact name or barcode', () => {
  assert.deepEqual(findScannedPOSItem(items, '890000000001', scale), {
    item: rice,
    quantity: 1,
    isStockQuantity: false,
  });
  assert.deepEqual(findScannedPOSItem(items, 'eggs'), {
    item: eggs,
    quantity: 1,
    isStockQuantity: false,
  });
  assert.equal(findScannedPOSItem(items, '211234501500'), undefined);
  assert.equal(findScannedPOSItem(items, 'Egg'), undefined);
});

test('any barcode matches exactly, whatever its length or characters', () => {
  const tagged = { name: 'Tagged', barcodes: ['ABC-abc-1234'], unit: 'Unit' };
  const short = { name: 'Short', barcodes: ['96385074'], unit: 'Unit' };
  assert.deepEqual(findScannedPOSItem([tagged, short], 'ABC-abc-1234'), {
    item: tagged,
    quantity: 1,
    isStockQuantity: false,
  });
  assert.deepEqual(findScannedPOSItem([tagged, short], '96385074'), {
    item: short,
    quantity: 1,
    isStockQuantity: false,
  });
});

test('a scan looks up only the items its code, or its scale item code, may name', async () => {
  fyo.singles.POSSettings = scale;
  const requests = stubFrappe(() => ({ message: [riceRow] }));
  const stock = { 'Basmati Rice': { availableQty: 4 } };
  const { item, quantity } = await posItemSearch.getScannedItem(
    '211234501500',
    stock
  );
  assert.deepEqual(
    [item.name, item.rate.float, item.trackItem, item.availableQty, quantity],
    ['Basmati Rice', 80, true, 4, 1.5]
  );

  assert.equal(requests.length, 1);
  const { path, body } = requests[0];
  assert.equal(path, '/api/method/frappe.client.get_list');
  assert.equal(body.doctype, 'Books Item');
  assert.deepEqual(body.or_filters, [
    ['name', 'like', '211234501500'],
    ['Books Item Barcode', 'barcode', 'like', '211234501500'],
    ['name', 'like', '12345'],
    ['Books Item Barcode', 'barcode', 'like', '12345'],
  ]);
});

test('a scan finds an item by any of its barcodes, listed once', async () => {
  fyo.singles.POSSettings = {};
  // A barcode filter joins the item once per barcode row.
  stubFrappe(() => ({ message: [riceRow, riceRow] }));
  const { item, quantity } = await posItemSearch.getScannedItem('12345');

  assert.deepEqual(
    [item.name, item.barcodes, quantity],
    ['Basmati Rice', ['12345', '890000000001'], 1]
  );
});

test('a blank code looks nothing up', async () => {
  const requests = stubFrappe(() => ({ message: [riceRow] }));
  assert.equal(await posItemSearch.getScannedItem('  '), undefined);
  assert.equal(requests.length, 0);
});

test('a POS scan adds an item the POS does not list, a weight in the stock unit', async () => {
  fyo.singles.POSSettings = scale;
  stubFrappe(() => ({ message: [riceRow] }));
  const added = [];
  const pos = {
    items: [],
    itemQtyMap: {},
    itemSearchTerm: '',
    addItem: async (item, quantity, addition) =>
      added.push([item.name, quantity, addition]),
  };

  await POS.methods.handleItemSearch.call(pos, '890000000001', true);
  await POS.methods.handleItemSearch.call(pos, '211234501500', true);

  assert.deepEqual(added, [
    ['Basmati Rice', 1, { isStockQuantity: false }],
    ['Basmati Rice', 1.5, { isStockQuantity: true }],
  ]);
  assert.equal(pos.itemSearchTerm, '');
});

test('a POS scan keeps the text typed while its item was added', async () => {
  fyo.singles.POSSettings = scale;
  stubFrappe(() => ({ message: [riceRow] }));
  const pos = { items: [], itemQtyMap: {}, itemSearchTerm: '' };
  pos.addItem = async () => {
    pos.itemSearchTerm = '8900';
  };

  await POS.methods.handleItemSearch.call(pos, '890000000001', true);
  assert.equal(pos.itemSearchTerm, '8900');
});
