import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doctypes, mapping } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getModel,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// Links and tables target Books schema names, as the boot sends them.
window.frappe.boot.books.doctypes = Object.fromEntries(
  Object.entries(mapping).map(([schemaName, { doctype }]) => [
    schemaName,
    doctype,
  ])
);
stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype') ? { docs: getBundle(body.doctype) } : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

/** A doctype's meta, then its tables', as `getdoctype` sends them. */
function getBundle(doctype) {
  const meta = doctypes.find(({ name }) => name === doctype);
  const tables = meta.fields
    .filter(({ fieldtype }) => fieldtype === 'Table')
    .map(({ options }) => doctypes.find(({ name }) => name === options));
  return [meta, ...tables];
}

/** The form's fields as `fieldname | label | placeholder | section`. */
function getLayout(schemaName) {
  return getSchema(schemaName)
    .fields.filter((field) => !field.meta)
    .map(({ fieldname, label, placeholder, section }) =>
      [fieldname, label, placeholder, section].join(' | ')
    );
}

function getColumns(schemaName) {
  return getModel(schemaName)
    .getListViewSettings()
    .columns.map((column) => column.fieldname ?? column);
}

test('item group, unit, location, batch and serial number forms show what they showed', () => {
  assert.deepEqual(getLayout('ItemGroup'), [
    'image | Image |  | Default',
    'name | Name | Name | Default',
    'tax | Tax | Tax | Default',
    'hsn_code | HSN/SAC | HSN/SAC Code | Default',
  ]);
  assert.deepEqual(getLayout('UOM'), [
    'name | UOM | Item Name | Default',
    'is_whole | Is Whole |  | Default',
  ]);
  assert.deepEqual(getLayout('Location'), [
    'name | Location Name |  | Default',
    'address | Address |  | Default',
  ]);
  assert.deepEqual(getLayout('Batch'), [
    'name | Batch |  | Default',
    'item | Item |  | Default',
    'expiry_date | Expiry Date |  | Default',
    'manufacture_date | Manufacture Date |  | Default',
  ]);
  assert.deepEqual(getLayout('SerialNumber'), [
    'name | Serial Number |  | Default',
    'item | Item |  | Default',
    'description | Description | Serial Number Description | Default',
    'status | Status |  | Default',
  ]);
  assert.equal(getSchema('ItemGroup').label, 'item Group');
  assert.deepEqual(getSchema('Batch').quickEditFields, [
    'item',
    'expiry_date',
    'manufacture_date',
  ]);
});

test('item group, batch and serial number lists show their columns', () => {
  assert.deepEqual(getColumns('ItemGroup'), ['name', 'tax', 'hsn_code']);
  assert.deepEqual(getColumns('Batch'), [
    'name',
    'expiry_date',
    'manufacture_date',
  ]);
  assert.deepEqual(getColumns('SerialNumber'), [
    'name',
    'status',
    'item',
    'description',
  ]);
});

test('a serial number status badge takes the DocType state colour', () => {
  const [, status] = getModel('SerialNumber').getListViewSettings().columns;
  const schema = getSchema('SerialNumber');
  assert.deepEqual(status.badge({ schema, status: 'Delivered' }), {
    label: 'Delivered',
    theme: 'blue',
  });
  assert.deepEqual(status.badge({ schema, status: 'Active' }), {
    label: 'Active',
    theme: 'green',
  });
});
