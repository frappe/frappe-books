import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

async function makeFixture(storedForm) {
  let definitions = [];
  let stored = structuredClone(storedForm);
  let updateError;
  let updateCount = 0;
  let loadCount = 0;
  class DefinitionStore {
    getSchemaMap() {
      return getSchemas('-', definitions);
    }
    call(method, schemaName, value) {
      if (stored && schemaName === 'CustomForm') {
        if (method === 'get' && value === stored.name) {
          loadCount++;
          return structuredClone(stored);
        }
        if (method === 'update') {
          if (value.__expectedModified !== stored.modified) {
            throw new Error('Changed after it was opened');
          }
          updateCount++;
          if (updateError) {
            const error = updateError;
            updateError = undefined;
            throw error;
          }
          const modified = Date.parse(stored.modified) + 1000;
          stored = structuredClone(value);
          delete stored.__expectedModified;
          stored.modified = new Date(modified).toISOString();
          return structuredClone(stored);
        }
      }
      throw new Error(`Unexpected database call: ${method}`);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: DefinitionStore });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const form = stored
    ? await fyo.doc.getDoc('CustomForm', stored.name)
    : fyo.doc.getNewDoc('CustomForm', { name: 'UOM' });
  if (!stored) {
    await form.append('customFields', {
      label: 'My Note',
      fieldname: 'myNote',
    });
  }
  return {
    fyo,
    form,
    row: form.customFields[0],
    setDefinitions: (values) => {
      definitions = values;
    },
    rejectNextUpdate: (error) => {
      updateError = error;
    },
    setStoredModified: (value) => {
      stored.modified = value;
    },
    getUpdateCount: () => updateCount,
    getLoadCount: () => loadCount,
  };
}

test('editing a custom field label preserves its key and does not match itself', async () => {
  const { row } = await makeFixture();
  await row.set('label', 'Renamed Note');
  await row._validateFields();
  assert.equal(row.fieldname, 'myNote');
  assert.equal(row.label, 'Renamed Note');
});

test('custom field names still reject another row and built-in fields', async () => {
  const { form, row } = await makeFixture();
  await assert.rejects(row.set('fieldname', 'isWhole'), /already exists/);
  await form.append('customFields', {
    label: 'Other Note',
    fieldname: 'otherNote',
  });
  await assert.rejects(
    form.customFields[1].set('fieldname', 'myNote'),
    /already used/
  );
});

test('select fields require at least two options before save', async () => {
  const { form, row } = await makeFixture();
  await row.set('fieldtype', 'Select');
  await row.set('options', 'One');
  await assert.rejects(form.validate(), /At least two options/);
  await row.set('options', 'One\nTwo');
  await form.validate();
});

test('optional custom fields retain their configured defaults', async () => {
  const { fyo, form, setDefinitions } = await makeFixture();
  setDefinitions([
    {
      parent: 'UOM',
      label: 'My Note',
      fieldname: 'myNote',
      fieldtype: 'Data',
      isRequired: false,
      default: 'Optional default',
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
  const field = {
    parent: 'UOM',
    label: 'My Note',
    fieldname: 'myNote',
    fieldtype: 'Data',
    isRequired: true,
    default: 'Initial note',
    tab: 'Custom',
  };
  setDefinitions([field]);
  await form.afterSync();
  assert.ok(unit.fieldMap.myNote);
  assert.equal(unit.myNote, 'Initial note');
  await unit.set('myNote', 'Unsaved note');

  setDefinitions([{ ...field, label: 'Updated label' }]);
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
      label: 'Packing Note',
      fieldname: 'packingNote',
      fieldtype: 'Data',
      tab: 'Custom',
    },
  ]);
  await form.afterSync();
  assert.ok(row.fieldMap.packingNote);
  assert.equal(row.item, 'Test Item');
  assert.equal(row.quantity, 2);
});

test('a failed validation can be corrected and saved without a false conflict', async () => {
  const { form, row, getUpdateCount } = await makeFixture(savedForm());
  const modified = form.modified;
  const modifiedBy = form.modifiedBy;
  await row.set('fieldtype', 'Select');
  await row.set('options', 'One');
  await assert.rejects(form.sync(), /At least two options/);
  assert.equal(form.modified, modified);
  assert.equal(form.modifiedBy, modifiedBy);
  assert.equal(form.isSyncing, false);
  assert.equal(getUpdateCount(), 0);

  await row.set('options', 'One\nTwo');
  await form.sync();
  assert.equal(getUpdateCount(), 1);
  assert.ok(form.modified > modified);
  assert.equal(form.customFields[0].options, 'One\nTwo');
  assert.equal(form.isSyncing, false);
});

test('a rejected database update preserves the saved timestamp for retry', async () => {
  const { form, row, rejectNextUpdate, getUpdateCount } =
    await makeFixture(savedForm());
  const modified = form.modified;
  await row.set('label', 'Updated Note');
  rejectNextUpdate(new Error('Database validation failed'));
  await assert.rejects(form.sync(), /Database validation failed/);
  assert.equal(form.modified, modified);
  assert.equal(form.isSyncing, false);

  await form.sync();
  assert.equal(getUpdateCount(), 2);
  assert.equal(form.customFields[0].label, 'Updated Note');
});

test('a real concurrent edit is rejected by the server check alone', async () => {
  const { form, row, setStoredModified, getUpdateCount, getLoadCount } =
    await makeFixture(savedForm());
  const modified = form.modified;
  await row.set('label', 'Updated Note');
  setStoredModified('2026-09-05T02:00:00.000Z');
  await assert.rejects(form.sync(), /Changed after it was opened/);
  assert.equal(getUpdateCount(), 0);
  assert.equal(getLoadCount(), 1);
  assert.equal(form.modified, modified);
  assert.equal(form.isSyncing, false);
});

function savedForm() {
  return {
    name: 'UOM',
    created: '2026-09-05T01:00:00.000Z',
    createdBy: 'Original Editor',
    modified: '2026-09-05T01:00:00.000Z',
    modifiedBy: 'Original Editor',
    customFields: [
      {
        name: 'saved-custom-field',
        label: 'My Note',
        fieldname: 'myNote',
        fieldtype: 'Data',
      },
    ],
  };
}

test('a schema refresh failure preserves the saved customization and notifies other views', async () => {
  const { fyo, form, row, getUpdateCount } = await makeFixture(savedForm());
  const warnings = [];
  let notified = false;
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  fyo.db.refreshSchemaMap = async () => {
    throw new Error('Schema refresh failed');
  };
  form.once('afterSync', () => {
    notified = true;
  });
  await row.set('label', 'Saved label');

  await form.sync();

  assert.equal(getUpdateCount(), 1);
  assert.equal(form.dirty, false);
  assert.equal(notified, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].action, 'save');
  assert.equal(
    (await fyo.db.get('CustomForm', form.name)).customFields[0].label,
    'Saved label'
  );
});
