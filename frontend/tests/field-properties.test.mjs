import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateReadOnly, newFrappeDoc, toSchema } from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

/** The field /books shows for a DocField, with what the model presents of it. */
function getField(docfield, presentation = {}) {
  const meta = {
    name: 'Books Thing',
    permissions: [],
    fields: [{ fieldname: 'thing', label: 'Thing', ...docfield }],
  };
  const schema = toSchema(
    meta,
    'Thing',
    { label: 'Thing', fields: { thing: presentation } },
    { schemaNames: { 'Books Party': 'Party' }, roles: [], placements: {} }
  );
  return schema.fields.find(({ fieldname }) => fieldname === 'thing');
}

test('the server decides required, default, read only and minimum value', () => {
  const email = getField({ fieldtype: 'Data', reqd: 1, read_only: 1 });
  assert.equal(email.required, true);
  assert.equal(email.readOnly, true);

  const rate = getField({
    fieldtype: 'Currency',
    non_negative: 1,
    default: '5',
  });
  assert.equal(rate.minvalue, 0);
  assert.equal(rate.default, 5);

  const role = getField({ fieldtype: 'Select', options: 'Both\nCustomer' });
  assert.equal(role.required, undefined);
  assert.equal(role.default, undefined);
});

test('a Color field offers its options as the palette', () => {
  const color = getField({ fieldtype: 'Color', options: '#ff0000\n#00ff00' });
  assert.deepEqual(color.options, [
    { value: '#ff0000', label: '#ff0000' },
    { value: '#00ff00', label: '#00ff00' },
  ]);
});

test('a DocField max_value limits the number, and 0 sets no limit', () => {
  assert.equal(getField({ fieldtype: 'Int', max_value: 9 }).maxvalue, 9);
  assert.equal(
    getField({ fieldtype: 'Int', max_value: 0 }).maxvalue,
    undefined
  );
});

test('the server date defaults Now and Today give a new document the current date', async () => {
  await loadFrappeModels();
  for (const [schemaName, fieldname] of [
    ['SalesInvoice', 'date'],
    ['Payment', 'date'],
    ['JournalEntry', 'posting_date'],
    ['Shipment', 'date'],
  ]) {
    const before = Date.now();
    const date = newFrappeDoc(schemaName)[fieldname];
    assert.ok(date instanceof Date, schemaName);
    assert.ok(
      date.getTime() >= before && date.getTime() <= Date.now(),
      schemaName
    );
  }
});

test('Frappe field types and links become Books field types and targets', () => {
  const cases = [
    ['Attach Image', 'AttachImage'],
    ['Attach', 'Attachment'],
    ['Code', 'Text'],
    ['Small Text', 'Text'],
    ['Autocomplete', 'AutoComplete'],
  ];
  for (const [fieldtype, booksFieldtype] of cases) {
    assert.equal(getField({ fieldtype }).fieldtype, booksFieldtype);
  }

  const party = getField({ fieldtype: 'Link', options: 'Books Party' });
  assert.equal(party.target, 'Party');
  const name = getField({ fieldtype: 'Dynamic Link', options: 'party_type' });
  assert.deepEqual(
    [name.fieldtype, name.references],
    ['DynamicLink', 'party_type']
  );
  const check = getField({ fieldtype: 'Check', default: '1' });
  assert.equal(check.default, true);
});

test('option values come from the server and labels from the model', () => {
  const movementType = getField(
    { fieldtype: 'Select', options: 'MaterialIssue\nManufacture\nOnHold' },
    { optionLabels: { MaterialIssue: 'Material Issue' } }
  );
  assert.deepEqual(movementType.options, [
    { value: 'MaterialIssue', label: 'Material Issue' },
    { value: 'Manufacture', label: 'Manufacture' },
    { value: 'OnHold', label: 'OnHold' },
  ]);
});

test('a field set only once is read only after the first save', () => {
  const unit = getField({
    fieldtype: 'Link',
    options: 'Books Uom',
    set_only_once: 1,
  });
  const doc = { canWrite: true, hasFieldRule: () => false };
  assert.equal(evaluateReadOnly(unit, { ...doc, inserted: false }), false);
  assert.equal(evaluateReadOnly(unit, { ...doc, inserted: true }), true);
});
