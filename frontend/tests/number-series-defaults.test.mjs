import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas, models } from './helpers/accounting.mjs';

test('new documents take the number series the server resolves', async () => {
  const series = {
    SalesInvoice: 'INV-',
    StockMovement: 'MOVE-',
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
  fyo.singles.SystemSettings = { currency: 'USD', displayPrecision: 2 };

  await fyo.loadDefaultNumberSeries();
  for (const [schemaName, numberSeries] of Object.entries(series)) {
    assert.equal(fyo.doc.getNewDoc(schemaName).numberSeries, numberSeries);
  }

  series.SalesInvoice = 'SALE-';
  await fyo.doc.getNewDoc('Defaults').afterSync();
  assert.equal(fyo.doc.getNewDoc('SalesInvoice').numberSeries, 'SALE-');
  assert.deepEqual(calls, ['getDefaultNumberSeries', 'getDefaultNumberSeries']);
});
