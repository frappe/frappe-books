import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findScannedPOSItem } from './helpers/accounting.mjs';

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
