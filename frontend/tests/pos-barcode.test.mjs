import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findScannedPOSItem } from './helpers/accounting.mjs';
import { posItemSearch, stubFrappe } from './helpers/frappe.mjs';

const rice = {
  name: 'Basmati Rice',
  itemCode: '12345',
  barcode: '890000000001',
  unit: 'Kg',
};
const eggs = { name: 'Eggs', itemCode: '54321', unit: 'Unit' };
const items = [rice, eggs];
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
  });
  assert.deepEqual(findScannedPOSItem(items, '215432100012', scale), {
    item: eggs,
    quantity: 12,
  });
});

test('other codes match a 12 digit barcode or an exact name or code', () => {
  assert.deepEqual(findScannedPOSItem(items, '890000000001', scale), {
    item: rice,
    quantity: 1,
  });
  assert.deepEqual(findScannedPOSItem(items, 'eggs'), {
    item: eggs,
    quantity: 1,
  });
  assert.equal(findScannedPOSItem(items, '211234501500'), undefined);
  assert.equal(findScannedPOSItem(items, 'Egg'), undefined);
});

test('any barcode matches exactly, whatever its length or characters', () => {
  const tagged = { name: 'Tagged', barcode: 'ABC-abc-1234', unit: 'Unit' };
  const short = { name: 'Short', barcode: '96385074', unit: 'Unit' };
  assert.deepEqual(findScannedPOSItem([tagged, short], 'ABC-abc-1234'), {
    item: tagged,
    quantity: 1,
  });
  assert.deepEqual(findScannedPOSItem([tagged, short], '96385074'), {
    item: short,
    quantity: 1,
  });
});

test('a scan looks up only the items its code, or its scale item code, may name', async () => {
  const requests = stubFrappe(() => ({
    message: [{ name: 'Basmati Rice', item_code: '12345', unit: 'Kg' }],
  }));
  const scanned = await posItemSearch.getScannableItems('211234501500', scale);
  assert.deepEqual(scanned, [
    { name: 'Basmati Rice', itemCode: '12345', barcode: undefined, unit: 'Kg' },
  ]);

  assert.equal(requests.length, 1);
  const { path, body } = requests[0];
  assert.equal(path, '/api/method/frappe.client.get_list');
  assert.equal(body.doctype, 'Books Item');
  assert.deepEqual(body.or_filters, [
    ['name', 'like', '211234501500'],
    ['item_code', 'like', '211234501500'],
    ['barcode', 'like', '211234501500'],
    ['name', 'like', '12345'],
    ['item_code', 'like', '12345'],
    ['barcode', 'like', '12345'],
  ]);
});
