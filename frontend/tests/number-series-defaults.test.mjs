import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Fyo,
  frappeModels,
  getSchemas,
  models,
} from './helpers/accounting.mjs';

test('new documents take the number series the server resolves', async () => {
  const series = {
    SalesInvoice: 'INV-',
  };
  const calls = [];
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }
    call(method) {
      throw new Error(`Unexpected database call: ${method}`);
    }
    callBespoke(method) {
      calls.push(method);
      return { ...series };
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.SystemSettings = { currency: 'USD', display_precision: 2 };

  await fyo.loadDefaultNumberSeries();
  for (const [schemaName, numberSeries] of Object.entries(series)) {
    assert.equal(fyo.doc.getNewDoc(schemaName).numberSeries, numberSeries);
  }

  series.SalesInvoice = 'SALE-';
  const schema = { name: 'Defaults', fields: [], isSingle: true };
  await new frappeModels.Defaults(schema, {}, fyo, false).afterSync();
  assert.equal(fyo.doc.getNewDoc('SalesInvoice').numberSeries, 'SALE-');
  assert.deepEqual(calls, ['getDefaultNumberSeries', 'getDefaultNumberSeries']);
});
