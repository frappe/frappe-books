import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getQuickViewFields,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';
import { previousForms } from './helpers/previousForms.mjs';

const note = {
  fieldname: 'custom_books_note',
  fieldtype: 'Data',
  label: 'Note',
  is_custom_field: 1,
};

stubFrappe(({ path, body }) => {
  if (!path.endsWith('get_books_meta')) {
    return { data: [] };
  }

  const books = getBooksMeta(body.doctypes);
  const payment = books.metas.find(({ name }) => name === 'Books Payment');
  payment.fields = [note, ...payment.fields];
  return { message: books };
});
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

const quickView = (schemaName) =>
  getQuickViewFields(schemaName)
    .filter(({ isCustom }) => !isCustom)
    .map(({ fieldname, label }) => `${fieldname} | ${label}`);

for (const [schemaName, fields] of Object.entries(previousForms.quickViews)) {
  test(`a ${schemaName} quick view lists the fields it listed`, () => {
    assert.deepEqual(quickView(schemaName), fields);
  });
}

test('custom fields follow the fields a quick view names', () => {
  const fields = getQuickViewFields('Payment').map(
    ({ fieldname }) => fieldname
  );
  assert.equal(fields.at(-1), 'custom_books_note');
  assert.equal(fields[0], 'number_series');
});
