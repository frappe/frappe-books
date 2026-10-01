import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  fyo,
  getFrappeDoc,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

const MODIFIED = '2026-09-28 10:00:00.123456';
const fields = [{ fieldname: 'value', fieldtype: 'Data', label: 'Value' }];
const metas = {
  master: { name: 'Books Record', autoname: 'Prompt', fields },
  transaction: {
    name: 'Books Record Entry',
    autoname: 'Prompt',
    is_submittable: 1,
    fields,
  },
  singleton: { name: 'Books Record Settings', issingle: 1, fields },
};
const schemaNames = {
  master: 'Record',
  transaction: 'RecordEntry',
  singleton: 'RecordSettings',
};

registerFrappeModels(
  Object.fromEntries(
    Object.entries(metas).map(([kind, meta]) => [
      schemaNames[kind],
      class extends FrappeDoc {
        static doctype = meta.name;
        static presentation = { label: meta.name };
      },
    ])
  )
);
stubFrappe(() => ({
  message: {
    metas: Object.values(metas).map((meta) => ({ permissions: [], ...meta })),
    placements: {},
  },
}));
await loadFrappeDocTypes();

let saved = 0;

/** A new document of the kind, and a server that stores what it is sent. */
function makeFixture(kind, savedName) {
  const warnings = [];
  const writes = [];
  let stored;
  let writeError;
  let loadCount = 0;
  let loading;
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  stubFrappe(async ({ method, body }) => {
    if (method === 'GET') {
      loadCount++;
      await loading;
      return { data: structuredClone(stored) };
    }

    if (writeError) {
      const message = writeError;
      writeError = undefined;
      return { status: 417, body: { errors: [{ message }] } };
    }

    stored = { ...stored, ...body, name: savedName ?? body.name ?? 'Record' };
    stored.modified = body.modified ?? MODIFIED;
    writes.push(structuredClone(stored));
    return { data: structuredClone(stored) };
  });
  saved += 1;
  const name = kind === 'singleton' ? undefined : `Record ${saved}`;
  const doc = newFrappeDoc(schemaNames[kind], { name, value: 'Initial' });
  return {
    doc,
    warnings,
    writes,
    rejectWrite: (message) => {
      writeError = message;
    },
    loads: () => loadCount,
    setStored: (values) => {
      stored = { ...stored, ...values };
    },
    holdLoads: (until) => {
      loading = until;
    },
  };
}

for (const kind of ['master', 'transaction', 'singleton']) {
  test(`${kind} saves and updates remain successful when post-save hooks fail`, async () => {
    const { doc, warnings, writes } = makeFixture(kind);
    const schemaName = schemaNames[kind];
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
    const failList = () => {
      throw new Error('List refresh failed');
    };
    const refreshList = () => calls.push('list');
    fyo.observer.on(`sync:${schemaName}`, failList);
    fyo.observer.on(`sync:${schemaName}`, refreshList);

    try {
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
      assert.equal(await getFrappeDoc(schemaName, doc.name), doc);

      await doc.set('value', 'Updated');
      await doc.sync();
      assert.equal(writes.length, 2);
      assert.equal(writes[1].value, 'Updated');
      assert.equal(doc.dirty, false);
      assert.deepEqual(calls, ['once', 'next', 'list', 'list']);
      assert.equal(warnings[1].errors.length, 3);
    } finally {
      fyo.observer.off(`sync:${schemaName}`, failList);
      fyo.observer.off(`sync:${schemaName}`, refreshList);
    }
  });
}

test('saving twice while the first save runs inserts the document once', async () => {
  const { doc, writes } = makeFixture('master');
  const first = doc.sync();
  assert.equal(doc.isSyncing, true);
  const second = doc.sync();
  assert.equal(await first, doc);
  assert.equal(await second, doc);
  assert.equal(writes.length, 1);
  assert.equal(doc.isSyncing, false);
});

test('opening an open document reloads it unless it has unsaved edits', async () => {
  const { doc, loads, setStored } = makeFixture('master');
  await doc.sync();
  setStored({ value: 'Changed elsewhere' });

  assert.equal(await getFrappeDoc('Record', doc.name), doc);
  assert.equal(loads(), 0);
  await getFrappeDoc('Record', doc.name, { refresh: true });
  assert.equal(loads(), 1);
  assert.equal(doc.value, 'Changed elsewhere');

  await doc.set('value', 'Unsaved edit');
  setStored({ value: 'Changed again' });
  await getFrappeDoc('Record', doc.name, { refresh: true });
  assert.equal(loads(), 1);
  assert.equal(doc.value, 'Unsaved edit');
});

test('edits made while an open document reloads are kept', async () => {
  const { doc, setStored, holdLoads } = makeFixture('master');
  await doc.sync();
  setStored({ value: 'Changed elsewhere' });
  const load = Promise.withResolvers();
  holdLoads(load.promise);

  const refresh = getFrappeDoc('Record', doc.name, { refresh: true });
  await doc.set('value', 'Typed while loading');
  load.resolve();
  await refresh;

  assert.equal(doc.value, 'Typed while loading');
  assert.equal(doc.dirty, true);
});

for (const existing of [false, true]) {
  test(`a rejected ${existing ? 'update' : 'insert'} keeps edits and does not run post-save hooks`, async () => {
    const fixture = makeFixture('transaction');
    const { doc, warnings, writes } = fixture;
    if (existing) await doc.sync();
    await doc.set('value', 'Unsaved edit');
    fixture.rejectWrite('Write rejected');
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
  const { doc, warnings, writes } = makeFixture('master');
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

test('post-save errors do not stop the open document taking the name the server gave', async () => {
  const { doc } = makeFixture('master', 'SERVER-0001');
  const original = doc.name;
  doc.afterSync = () => {
    throw new Error('Refresh failed');
  };

  await doc.sync();

  assert.equal(doc.name, 'SERVER-0001');
  assert.equal(await getFrappeDoc('Record', 'SERVER-0001'), doc);
  assert.notEqual(original, 'SERVER-0001');
});

test('saved values survive failed change listeners', async () => {
  const { doc, warnings, writes } = makeFixture('transaction');
  let refreshed = false;
  doc.once('change', () => {
    throw new Error('Display listener failed');
  });
  doc.once('afterSync', () => {
    refreshed = true;
  });

  await doc.sync();

  assert.equal(doc.inserted, true);
  assert.equal(doc.canSave, false);
  assert.equal(doc.canSubmit, true);
  assert.equal(writes.length, 1);
  assert.equal(refreshed, true);
  assert.equal(warnings[0].action, 'save');
  assert.equal(warnings[0].errors.length, 1);
});
