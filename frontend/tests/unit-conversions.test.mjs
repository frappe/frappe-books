import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

const conversions = [
  { parent: 'Pen', uom: 'Box', conversionFactor: 12 },
  { parent: 'Pen', uom: 'Pack', conversionFactor: 6 },
];

async function makeRow(schemaName, values = {}) {
  const fyo = await makeFyo();
  fyo.db.getAll = async (_schemaName, { filters }) =>
    conversions.filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value)
    );
  const doc = fyo.doc.getNewDoc(schemaName, {
    items: [{ item: 'Pen', unit: 'Unit', ...values }],
  });
  return doc.items[0];
}

for (const schemaName of ['SalesInvoice']) {
  test(`a ${schemaName} row converts with its transfer unit's factor`, async () => {
    const row = await makeRow(schemaName, { transferUnit: 'Pack' });
    assert.equal(await row.formulas.unitConversionFactor.formula(), 6);
  });

  test(`a ${schemaName} row accepts the stock unit and the item's units`, async () => {
    const row = await makeRow(schemaName);
    await row.validations.transferUnit('Unit');
    await row.validations.transferUnit('Box');
    await assert.rejects(
      row.validations.transferUnit('Crate'),
      /Transfer Unit Crate is not applicable for Item Pen/
    );
  });

  test(`a new ${schemaName} row starts at one of its item's unit`, async () => {
    const fyo = await makeFyo();
    fyo.doc.getNewDoc('Item', { name: 'Rice', unit: 'Kg' });
    const doc = fyo.doc.getNewDoc(schemaName);
    await doc.append('items');
    await doc.items[0].set('item', 'Rice');
    clearTimeout(doc._previewTimer);

    const { quantity, transferQuantity, unit, transferUnit } = doc.items[0];
    assert.deepEqual(
      [quantity, transferQuantity, unit, transferUnit],
      [1, 1, 'Kg', 'Kg']
    );
  });
}
