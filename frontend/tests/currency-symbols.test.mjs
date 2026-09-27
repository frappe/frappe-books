import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

test('amounts carry the currency symbol once symbols are loaded', async () => {
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }
    call(method, schemaName) {
      assert.equal(method, 'getAll');
      assert.equal(schemaName, 'Currency');
      return [
        { name: 'INR', symbol: '₹' },
        { name: 'XYZ', symbol: null },
      ];
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const field = { fieldname: 'amount', fieldtype: 'Currency' };

  assert.doesNotMatch(fyo.format(fyo.pesa(5), field), /₹/);
  await fyo.loadCurrencySymbols();
  assert.deepEqual(fyo.currencySymbols, { INR: '₹', XYZ: undefined });
  assert.match(fyo.format(fyo.pesa(5), field), /^₹ 5\.00$/);
});
