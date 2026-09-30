import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, frappeModels, getSchemas } from './helpers/accounting.mjs';

// Saving a Custom Form shows its fields on the forms the bridge still serves.
async function makeFixture() {
  let definitions = [];
  class DefinitionStore {
    getSchemaMap() {
      return getSchemas('-', definitions);
    }
    call(method) {
      throw new Error(`Unexpected database call: ${method}`);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: DefinitionStore });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const schema = { name: 'CustomForm', fields: [] };
  const form = new frappeModels.CustomForm(schema, {}, fyo, false);
  form.name = 'UOM';
  return {
    fyo,
    form,
    setDefinitions: (values) => {
      definitions = values;
    },
  };
}

test('optional custom fields retain their configured defaults', async () => {
  const { fyo, form, setDefinitions } = await makeFixture();
  setDefinitions([
    {
      parent: 'UOM',
      fieldname: 'myNote',
      docfield: {
        fieldtype: 'Data',
        label: 'My Note',
        default: 'Optional default',
      },
    },
  ]);
  await form.afterSync();
  const unit = fyo.doc.getNewDoc('UOM');
  assert.equal(unit.myNote, 'Optional default');
  assert.equal(unit.fieldMap.myNote.required, false);
});

test('saving and deleting customizations refresh cached documents without losing edits', async () => {
  const { fyo, form, setDefinitions } = await makeFixture();
  const unit = fyo.doc.getNewDoc('UOM', {
    name: 'Test Unit',
    isWhole: true,
  });
  const docfield = {
    fieldtype: 'Data',
    label: 'My Note',
    reqd: 1,
    default: 'Initial note',
  };
  const field = { parent: 'UOM', fieldname: 'myNote', tab: 'Custom', docfield };
  setDefinitions([field]);
  await form.afterSync();
  assert.ok(unit.fieldMap.myNote);
  assert.equal(unit.myNote, 'Initial note');
  await unit.set('myNote', 'Unsaved note');

  setDefinitions([
    { ...field, docfield: { ...docfield, label: 'Updated label' } },
  ]);
  await form.afterSync();
  assert.equal(unit.fieldMap.myNote.label, 'Updated label');
  assert.equal(unit.myNote, 'Unsaved note');
  assert.equal(unit.isWhole, true);
  assert.equal(fyo.docs.get('UOM')['Test Unit'], unit);

  setDefinitions([]);
  await form.afterDelete();
  assert.equal(unit.fieldMap.myNote, undefined);
  assert.equal(
    fyo.schemaMap.UOM.fields.some((field) => field.fieldname === 'myNote'),
    false
  );
  assert.equal(unit.getValidDict().myNote, undefined);
  assert.equal(unit.isWhole, true);
});

test('customizing a child schema refreshes rows inside cached parent documents', async () => {
  const { fyo, form, setDefinitions } = await makeFixture();
  const invoice = fyo.doc.getNewDoc('SalesInvoice');
  await invoice.append('items', { item: 'Test Item', quantity: 2 });
  const row = invoice.items[0];
  form.name = 'SalesInvoiceItem';
  setDefinitions([
    {
      parent: 'SalesInvoiceItem',
      fieldname: 'packingNote',
      tab: 'Custom',
      docfield: { fieldtype: 'Data', label: 'Packing Note' },
    },
  ]);
  await form.afterSync();
  assert.ok(row.fieldMap.packingNote);
  assert.equal(row.item, 'Test Item');
  assert.equal(row.quantity, 2);
});
