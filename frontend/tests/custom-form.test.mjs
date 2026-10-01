import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// Custom fields by doctype, and where each Custom Form places them by fieldname.
const customFields = {};
const placements = {};

/** Answers the meta of each doctype with its custom fields, and the Custom Forms' placements. */
function serveCustomizedMeta() {
  stubFrappe(({ body }) => {
    const { metas } = getBooksMeta(body.doctypes);
    const customized = metas.map((meta) => ({
      ...meta,
      fields: [...meta.fields, ...(customFields[meta.name] ?? [])],
    }));
    return { message: { metas: customized, placements } };
  });
}

/** Saves a customization of a doctype, as its Custom Form's save announces it. */
async function customize(doctype, fields) {
  customFields[doctype] = fields.map(({ docfield }) => docfield);
  placements[doctype] = Object.fromEntries(
    fields.map(({ docfield }) => [
      docfield.fieldname,
      { section: 'Default', tab: 'Custom' },
    ])
  );
  await fyo.observer.trigger('sync:CustomForm', doctype);
}

before(async () => {
  serveCustomizedMeta();
  registerFrappeModels({
    UOM: frappeModels.UOM,
    SalesInvoice: frappeModels.SalesInvoice,
  });
  await loadFrappeDocTypes();
});

const note = (docfield = {}) => ({
  fieldname: 'myNote',
  docfield: {
    fieldname: 'custom_books_mynote',
    fieldtype: 'Data',
    label: 'My Note',
    is_custom_field: 1,
    ...docfield,
  },
});

test('optional custom fields retain their configured defaults', async () => {
  await customize('Books Uom', [note({ default: 'Optional default' })]);

  const unit = newFrappeDoc('UOM');
  assert.equal(unit.custom_books_mynote, 'Optional default');
  assert.equal(unit.fieldMap.custom_books_mynote.required, undefined);
  await customize('Books Uom', []);
});

test('a custom check field without a default starts unchecked and saves', async () => {
  await customize('Books Uom', [
    {
      fieldname: 'fragile',
      docfield: {
        fieldname: 'custom_books_fragile',
        fieldtype: 'Check',
        label: 'Fragile',
        is_custom_field: 1,
      },
    },
  ]);

  const unit = newFrappeDoc('UOM', { name: 'Box' });
  assert.equal(unit.custom_books_fragile, false);
  assert.equal(unit.getFrappeValues().custom_books_fragile, 0);
  await customize('Books Uom', []);
});

test('saving and deleting customizations refresh open documents without losing edits', async () => {
  const unit = newFrappeDoc('UOM', { name: 'Test Unit', is_whole: true });
  await customize('Books Uom', [note({ reqd: 1, default: 'Initial note' })]);
  assert.equal(unit.fieldMap.custom_books_mynote.tab, 'Custom');
  assert.equal(unit.custom_books_mynote, 'Initial note');
  await unit.set('custom_books_mynote', 'Unsaved note');

  await customize('Books Uom', [note({ label: 'Updated label' })]);
  assert.equal(unit.fieldMap.custom_books_mynote.label, 'Updated label');
  assert.equal(unit.custom_books_mynote, 'Unsaved note');
  assert.equal(unit.is_whole, true);

  await customize('Books Uom', []);
  assert.equal(unit.fieldMap.custom_books_mynote, undefined);
  assert.equal('custom_books_mynote' in unit.getFrappeValues(), false);
  assert.equal(unit.is_whole, true);
});

test('customizing a table refreshes the rows of open documents', async () => {
  const invoice = newFrappeDoc('SalesInvoice');
  clearTimeout(invoice._previewTimer);
  invoice.push('items', { item: 'Test Item', quantity: 2 });
  const [row] = invoice.items;

  await customize('Books Sales Invoice Item', [
    {
      fieldname: 'packingNote',
      docfield: {
        fieldname: 'custom_books_packingnote',
        fieldtype: 'Data',
        label: 'Packing Note',
        is_custom_field: 1,
      },
    },
  ]);

  assert.ok(row.fieldMap.custom_books_packingnote);
  assert.deepEqual([row.item, row.quantity], ['Test Item', 2]);
});
