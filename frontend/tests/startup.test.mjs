import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Fyo,
  FrappeDatabaseDemux,
  fieldProperties,
  models,
  setLanguageMapOnTranslationString,
  useTranslations,
} from './helpers/accounting.mjs';

test('startup builds one translated schema map for a non-English language', async () => {
  const calls = [];
  class Demux extends FrappeDatabaseDemux {
    call(method, schemaName) {
      calls.push([method, schemaName]);
      return method === 'get' ? {} : [];
    }
    async getFieldProperties() {
      calls.push(['getFieldProperties']);
      return fieldProperties;
    }
  }
  globalThis.window = { frappe: { boot: { books: { country_code: '-' } } } };
  useTranslations({ Date: 'Datum' });
  try {
    const fyo = new Fyo({ DatabaseDemux: Demux });
    await fyo.db.connect('-');
    await fyo.initializeAndRegister(models);

    const field = fyo.getField('SalesInvoice', 'date');
    assert.equal(field.label, 'Datum');
    assert.ok(Object.isFrozen(field));
    const customFieldCalls = calls.filter(([, name]) => name === 'CustomField');
    assert.equal(customFieldCalls.length, 1);
    const propertyCalls = calls.filter(
      ([method]) => method === 'getFieldProperties'
    );
    assert.equal(propertyCalls.length, 1);
  } finally {
    setLanguageMapOnTranslationString(undefined);
    delete globalThis.window;
  }
});
