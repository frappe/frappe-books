import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMethod } from './helpers/vue-method.mjs';
import {
  makeFyo,
  matchesStatus,
  mergeQueryFilters,
} from './helpers/accounting.mjs';

for (const control of ['Link', 'DynamicLink', 'MultiLabelLink']) {
  test(`${control} updates its captured parent after the control unmounts`, async () => {
    let onSave;
    const child = {
      name: 'New Child',
      once: (_event, callback) => {
        onSave = callback;
      },
    };
    const assignments = [];
    const parent = {
      set: async (field, value) => assignments.push([field, value]),
    };
    const fyo = { doc: { getNewDoc: () => child }, schemaMap: {} };
    const openNewDoc = await loadMethod(
      `src/components/Controls/${control}.vue`,
      'openNewDoc',
      {
        fyo,
        openUi: async () => ({ openQuickEdit: () => {} }),
        setLinkOnParent: async (parentDoc, fieldname, name) => {
          if (parentDoc && fieldname) await parentDoc.set(fieldname, name);
        },
      }
    );
    const controlInstance = {
      df: { target: 'Party', fieldname: 'party' },
      doc: parent,
      searchQuery: 'New Child',
      getCreateFilters: async () => ({}),
      getTargetSchemaName: () => 'Party',
      $router: { back() {} },
      triggerChange() {},
    };
    await openNewDoc.call(controlInstance);
    controlInstance.doc = undefined;
    onSave();
    assert.deepEqual(assignments, [['party', 'New Child']]);
  });
}

test('list queries never send computed statuses to the database', async () => {
  const fyo = await makeFyo();
  let query;
  fyo.db.getAll = async (_schema, options) => {
    query = options;
    return [
      { name: 'A', submitted: true, cancelled: true },
      { name: 'B', submitted: true, cancelled: false },
    ];
  };
  const updateData = await loadMethod(
    'src/pages/ListView/List.vue',
    'updateData',
    {
      fyo,
      matchesStatus,
      mergeQueryFilters,
      cloneDeep: structuredClone,
      toRaw: (x) => x,
    }
  );
  for (const filter of [
    ['not like', 'Cancelled'],
    ['like', '%can%'],
    ['is null', ''],
  ]) {
    const list = {
      schemaName: 'JournalEntry',
      filters: { status: filter },
      activeFilters: {},
      requestId: 0,
      $refs: {},
      $nextTick: async () => {},
      $emit() {},
    };
    await updateData.call(list);
    assert.equal(Object.hasOwn(query.filters, 'status'), false);
    assert.equal(list.data.length, filter[0] === 'is null' ? 0 : 1);
  }
  const lead = {
    schemaName: 'Lead',
    filters: { status: ['!=', 'Lost'] },
    activeFilters: {},
    requestId: 0,
    $refs: {},
    $nextTick: async () => {},
    $emit() {},
  };
  await updateData.call(lead);
  assert.deepEqual(query.filters.status, ['!=', 'Lost']);
});

test('a submittable list refreshes after a cancel', async () => {
  const events = [];
  const observer = { on: (event) => events.push(event) };
  const fyo = {
    schemaMap: { SalesInvoice: { isSubmittable: true } },
    doc: { observer },
    db: { observer },
  };
  const setUpdateListeners = await loadMethod(
    'src/pages/ListView/List.vue',
    'setUpdateListeners',
    { fyo }
  );
  setUpdateListeners.call({ schemaName: 'SalesInvoice' });
  assert.ok(events.includes('submit:SalesInvoice'));
  assert.ok(events.includes('cancel:SalesInvoice'));
});
