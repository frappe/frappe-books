import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo } from './helpers/fyo.mjs';

for (const kind of ['master', 'transaction', 'singleton']) {
  test(`${kind} saves and updates remain successful when post-save hooks fail`, async () => {
    const { fyo, doc, warnings, writes } = await makeFixture(kind);
    const calls = [];
    doc.afterSync = () => {
      throw new Error('Refresh failed');
    };
    doc.on('afterSync', () => {
      throw new Error('Listener failed');
    });
    doc.once('afterSync', () => {
      calls.push('once');
      throw new Error('Navigation failed');
    });
    doc.once('afterSync', () => calls.push('next'));
    fyo.doc.observer.on('sync:Record', () => {
      throw new Error('List refresh failed');
    });
    fyo.doc.observer.on('sync:Record', () => calls.push('list'));

    assert.equal(await doc.sync(), doc);
    assert.equal(doc.inserted, true);
    assert.equal(doc.dirty, false);
    assert.equal(doc.canSave, false);
    assert.equal(doc.canSubmit, kind === 'transaction');
    assert.equal(writes.length, 1);
    assert.equal(warnings[0].action, 'save');
    assert.equal(warnings[0].errors.length, 4);
    assert.match(warnings[0].message, /was saved/);
    assert.deepEqual(calls, ['once', 'next', 'list']);
    assert.equal(await fyo.doc.getDoc('Record', doc.name), doc);

    await doc.set('value', 'Updated');
    await doc.sync();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].value, 'Updated');
    assert.equal(doc.dirty, false);
    assert.deepEqual(calls, ['once', 'next', 'list', 'list']);
    assert.equal(warnings[1].errors.length, 3);
  });
}

test('saving twice while the first save runs inserts the document once', async () => {
  const { doc, writes } = await makeFixture('master');
  const first = doc.sync();
  assert.equal(doc.isSyncing, true);
  const second = doc.sync();
  assert.equal(await first, doc);
  assert.equal(await second, doc);
  assert.equal(writes.length, 1);
  assert.equal(doc.isSyncing, false);
});

for (const existing of [false, true]) {
  test(`a rejected ${existing ? 'update' : 'insert'} keeps edits and does not run post-save hooks`, async () => {
    const fixture = await makeFixture('transaction');
    const { doc, warnings, writes } = fixture;
    if (existing) await doc.sync();
    await doc.set('value', 'Unsaved edit');
    fixture.rejectWrite(new Error('Write rejected'));
    let called = false;
    doc.once('afterSync', () => {
      called = true;
    });

    await assert.rejects(doc.sync(), /Write rejected/);

    assert.equal(doc.inserted, existing);
    assert.equal(doc.dirty, true);
    assert.equal(doc.canSave, true);
    assert.equal(doc.canSubmit, false);
    assert.equal(doc.value, 'Unsaved edit');
    assert.equal(warnings.length, 0);
    assert.equal(called, false);
    assert.equal(writes.length, existing ? 1 : 0);

    await doc.sync();
    assert.equal(called, true);
    assert.equal(doc.canSubmit, true);
  });
}

test('validation still stops the save before any write or notification', async () => {
  const { doc, warnings, writes } = await makeFixture('master');
  doc.on('validate', () => {
    throw new Error('Invalid value');
  });
  doc.once('afterSync', () => assert.fail('Save did not succeed'));

  await assert.rejects(doc.sync(), /Invalid value/);

  assert.equal(writes.length, 0);
  assert.equal(doc.inserted, false);
  assert.equal(doc.canSave, true);
  assert.equal(warnings.length, 0);
});

test('post-save errors do not prevent the cache from adopting a server-assigned name', async () => {
  const { fyo, doc } = await makeFixture('master', 'SERVER-0001');
  const original = doc.name;
  doc.afterSync = () => {
    throw new Error('Refresh failed');
  };

  await doc.sync();

  assert.equal(doc.name, 'SERVER-0001');
  assert.equal(await fyo.doc.getDoc('Record', 'SERVER-0001'), doc);
  assert.equal(fyo.doc.docs.get('Record')[original], undefined);
});

test('saved values survive failed computed fields and change listeners', async () => {
  const { doc, warnings, writes } = await makeFixture(
    'transaction',
    'SERVER-0002'
  );
  let refreshed = false;
  doc._setComputedValuesFromFormulas = async () => {
    throw new Error('Display formula failed');
  };
  doc.once('change', () => {
    throw new Error('Display listener failed');
  });
  doc.once('afterSync', () => {
    refreshed = true;
  });

  await doc.sync();

  assert.equal(doc.name, 'SERVER-0002');
  assert.equal(doc.inserted, true);
  assert.equal(doc.canSave, false);
  assert.equal(doc.canSubmit, true);
  assert.equal(writes.length, 1);
  assert.equal(refreshed, true);
  assert.equal(warnings[0].action, 'save');
  assert.equal(warnings[0].errors.length, 2);
});

async function makeFixture(kind, savedName) {
  const warnings = [];
  const writes = [];
  let stored;
  let writeError;
  const schema = {
    name: 'Record',
    label: 'Record',
    naming: 'manual',
    isSingle: kind === 'singleton',
    isSubmittable: kind === 'transaction',
    fields: [
      { fieldname: 'name', fieldtype: 'Data', required: true },
      { fieldname: 'value', fieldtype: 'Data' },
      { fieldname: 'submitted', fieldtype: 'Check' },
      { fieldname: 'cancelled', fieldtype: 'Check' },
      ...(kind === 'singleton'
        ? []
        : [{ fieldname: 'modified', fieldtype: 'Datetime' }]),
    ],
  };
  class Store {
    getSchemaMap() {
      return { Record: schema };
    }
    call(method, _schemaName, values) {
      if (method === 'get') return structuredClone(stored);
      assert.ok(['insert', 'update'].includes(method), method);
      if (writeError) {
        const error = writeError;
        writeError = undefined;
        throw error;
      }
      stored = { ...values, name: savedName ?? values.name };
      writes.push(structuredClone(stored));
      return structuredClone(stored);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  await fyo.db.init();
  fyo.doc.registerModels({});
  const doc = fyo.doc.getNewDoc('Record', {
    name: kind === 'singleton' ? 'Record' : 'New record',
    value: 'Initial',
    submitted: false,
    cancelled: false,
  });
  return {
    fyo,
    doc,
    warnings,
    writes,
    rejectWrite: (error) => {
      writeError = error;
    },
  };
}
