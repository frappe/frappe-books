import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
  evaluateRequired,
  frappeModels,
  getSchema,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

const { CustomForm } = frappeModels;
const CustomField = CustomForm.rowModels.custom_fields;
await loadFrappeModels();

const field = (doc, fieldname) => doc.fieldMap[fieldname];

async function newForm() {
  const form = newFrappeDoc('CustomForm', { name: 'Books Uom' });
  await form.append('custom_fields', {
    label: 'My Note',
    fieldname: 'myNote',
  });
  return form;
}

test('the Custom Form asks for a form type among the forms Books can customize', () => {
  const nameField = getSchema('CustomForm').fields[0];
  assert.deepEqual(
    [nameField.fieldname, nameField.fieldtype, nameField.label],
    ['name', 'AutoComplete', 'Form Type']
  );

  const types = Object.fromEntries(
    CustomForm.lists
      .name(newFrappeDoc('CustomForm'))
      .map(({ value, label }) => [value, label])
  );
  assert.equal(types['Books Uom'], 'UOM');
  assert.equal(types['Books Sales Invoice'], 'Sales Invoice');
  assert.equal(types['Books Sales Invoice Item'], 'Sales Invoice Item');
  for (const doctype of [
    'Books System Settings',
    'Books Custom Form',
    'Books Setup Wizard',
    'Books Ledger Entry',
    'Books Stock Ledger Entry',
    'Books Loyalty Point Entry',
  ]) {
    assert.equal(doctype in types, false);
  }
});

test('custom field rows open in the row editor', () => {
  const table = getSchema('CustomForm').fields.find(
    (f) => f.fieldname === 'custom_fields'
  );
  assert.equal(table.edit, true);
});

test('a row edits the fields it edited, with the field types labelled as before', () => {
  const schema = getSchema('CustomField');
  assert.deepEqual(schema.quickEditFields.slice(4, 8), [
    'default',
    'options',
    'target',
    'references',
  ]);
  assert.deepEqual(schema.tableFields, [
    'label',
    'fieldname',
    'fieldtype',
    'is_required',
  ]);
  const types = Object.fromEntries(
    schema.fields
      .find((f) => f.fieldname === 'fieldtype')
      .options.map(({ value, label }) => [value, label])
  );
  assert.equal(types.DynamicLink, 'Dynamic Link');
  assert.equal(types.Data, 'Data');
});

test('a row asks for options, a target or references as its field type needs', async () => {
  const form = await newForm();
  const [row] = form.custom_fields;
  assert.ok(row instanceof CustomField);
  const shown = (fieldname) => !evaluateHidden(field(row, fieldname), row);
  const required = (fieldname) => evaluateRequired(field(row, fieldname), row);
  assert.deepEqual(['options', 'target', 'references'].map(shown), [
    false,
    false,
    false,
  ]);

  await row.set('fieldtype', 'Select');
  assert.equal(shown('options') && required('options'), true);
  await row.set('fieldtype', 'Color');
  assert.equal(shown('options') && !required('options'), true);
  await row.set('fieldtype', 'Link');
  assert.equal(shown('target') && required('target'), true);
  await row.set('fieldtype', 'DynamicLink');
  assert.equal(shown('references') && required('references'), true);

  await row.set('is_required', true);
  assert.equal(required('default'), true);
});

test('custom field names still reject another row and built-in fields', async () => {
  const form = await newForm();
  await assert.rejects(
    form.custom_fields[0].set('fieldname', 'is_whole'),
    /Fieldname is_whole already exists for UOM/
  );
  await form.append('custom_fields', { label: 'Other', fieldname: 'other' });
  await assert.rejects(
    form.custom_fields[1].set('fieldname', 'myNote'),
    /Fieldname myNote already used for Custom Field 1/
  );
});

test('a row links to other forms and references select fields of the form', async () => {
  const form = await newForm();
  await form.append('custom_fields', {
    label: 'Size',
    fieldname: 'size',
    fieldtype: 'Select',
  });
  const [row] = form.custom_fields;
  const targets = CustomField.lists.target(row).map(({ value }) => value);
  assert.ok(targets.includes('Books Party'));
  assert.equal(targets.includes('Books System Settings'), false);

  // References name Frappe fieldnames: a row's Custom Field, or a field of the form.
  const references = CustomField.lists.references(row);
  assert.deepEqual(references, [{ value: 'custom_books_size', label: 'Size' }]);
});

test('Dynamic Link references are the Select and DocType fields Frappe accepts', async () => {
  const form = newFrappeDoc('CustomForm', { name: 'Books Payment For' });
  await form.append('custom_fields', { label: 'Ref', fieldname: 'ref' });
  const references = CustomField.lists
    .references(form.custom_fields[0])
    .map(({ value }) => value);
  assert.deepEqual(references, ['reference_type']);
});

test('a Table field targets only child tables', async () => {
  const form = await newForm();
  const [row] = form.custom_fields;
  const targets = (fieldtype) => {
    row.fieldtype = fieldtype;
    return CustomField.lists.target(row).map(({ value }) => value);
  };
  assert.ok(targets('Table').includes('Books Sales Invoice Item'));
  assert.equal(targets('Table').includes('Books Party'), false);
  assert.ok(targets('Link').includes('Books Party'));
});

test('editing a row previews its name from the server', async () => {
  const requests = stubFrappe(({ body }) => ({
    docs: [
      {
        ...body.document,
        custom_fields: body.document.custom_fields.map((row) => ({
          ...row,
          fieldname: row.fieldname || 'deliveryDate',
        })),
      },
    ],
  }));
  const form = newFrappeDoc('CustomForm', { name: 'Books Uom' });
  await form.append('custom_fields', { label: 'Delivery Date' });
  await form.preview();

  assert.equal(requests[0].body.method, 'preview');
  assert.equal(form.custom_fields[0].fieldname, 'deliveryDate');
});
