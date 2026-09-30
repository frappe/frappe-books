import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMetaBundle } from './helpers/doctypes.mjs';
import {
  evaluateHidden,
  evaluateRequired,
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

const { CustomForm } = frappeModels;
const CustomField = CustomForm.rowModels.custom_fields;
window.frappe.boot.books.doctypes.CustomForm = 'Books Custom Form';
window.frappe.boot.books.doctypes.CustomField = 'Books Custom Field';
stubFrappe(({ path, body }) => {
  if (path.endsWith('getdoctype')) {
    return { docs: getMetaBundle(body.doctype) };
  }

  // The bridge schemas the Custom Form's rows name, without custom fields.
  if (path.endsWith('database_call')) {
    return { message: [] };
  }

  return path.endsWith('get_field_properties') ? { message: {} } : { data: [] };
});
registerFrappeModels({ CustomForm });
await Promise.all([loadFrappeDocTypes(), fyo.db.init()]);

const field = (doc, fieldname) => doc.fieldMap[fieldname];

async function newForm() {
  const form = newFrappeDoc('CustomForm', { name: 'UOM' });
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

  const types = CustomForm.lists
    .name(newFrappeDoc('CustomForm'))
    .map(({ value }) => value);
  assert.ok(types.includes('UOM'));
  assert.ok(types.includes('SalesInvoice'));
  for (const schemaName of ['SystemSettings', 'CustomForm', 'SetupWizard']) {
    assert.equal(types.includes(schemaName), false);
  }
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
    form.custom_fields[0].set('fieldname', 'isWhole'),
    /Fieldname isWhole already exists for UOM/
  );
  await form.append('custom_fields', { label: 'Other', fieldname: 'other' });
  await assert.rejects(
    form.custom_fields[1].set('fieldname', 'myNote'),
    /Fieldname myNote already used for Custom Field 1/
  );
});

test('a row links to other forms and references text fields of the form', async () => {
  const form = await newForm();
  await form.append('custom_fields', {
    label: 'Size',
    fieldname: 'size',
    fieldtype: 'Select',
  });
  const [row] = form.custom_fields;
  const targets = CustomField.lists.target(row).map(({ value }) => value);
  assert.ok(targets.includes('Party'));
  assert.equal(targets.includes('SystemSettings'), false);

  const references = CustomField.lists.references(row);
  assert.deepEqual(references[0], { value: 'myNote', label: 'My Note' });
  assert.deepEqual(references[1], { value: 'size', label: 'Size' });
  assert.ok(references.some(({ value }) => value === 'name'));
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
  const form = newFrappeDoc('CustomForm', { name: 'UOM' });
  await form.append('custom_fields', { label: 'Delivery Date' });
  await form.preview();

  assert.equal(requests[0].body.method, 'preview');
  assert.equal(form.custom_fields[0].fieldname, 'deliveryDate');
});
