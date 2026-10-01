import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  setLanguageMapOnTranslationString,
  stubFrappe,
} from './helpers/frappe.mjs';

test('startup loads every schema in one request, translated for a non-English language', async () => {
  const requests = stubFrappe(({ body }) => ({
    message: getBooksMeta(body.doctypes),
  }));
  setLanguageMapOnTranslationString({ Date: { translation: 'Datum' } });
  try {
    registerFrappeModels(frappeModels);
    await loadFrappeDocTypes();
  } finally {
    setLanguageMapOnTranslationString(undefined);
  }

  assert.deepEqual(
    requests.map(({ path }) => path),
    ['/api/method/frappe_books.meta.get_books_meta']
  );
  assert.deepEqual(
    requests[0].body.doctypes,
    Object.values(frappeModels).map(({ doctype }) => doctype)
  );
  const date = getSchema('SalesInvoice').fields.find(
    (field) => field.fieldname === 'date'
  );
  assert.equal(date.label, 'Datum');
  assert.equal(getSchema('SalesInvoiceItem').isChild, true);
});
