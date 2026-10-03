import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  createApp,
  effectScope,
  frappeModels,
  fyo,
  Search,
  searcherKey,
  shallowRef,
  stubFrappe,
  useSearch,
} from './helpers/frappe.mjs';
import { sortByFuzzyMatch } from './helpers/ui.mjs';

await loadFrappeModels(frappeModels);

/** A search whose server answers `rows(request)` for each doctype's search. */
function makeSearch(rows = () => []) {
  const requests = stubFrappe(async (request) => ({
    message: await rows(request),
  }));
  const search = new Search(fyo);
  search.initialize();
  return { search, requests };
}

const docs = (search, input) =>
  search.search(input).filter((item) => item.group === 'Docs');

const invoice = (name, docstatus) => ({
  doctype: 'Books Sales Invoice',
  name,
  party: 'Acme',
  docstatus,
});

test('the palette searches the schemas the DocType search fields name', () => {
  const { search, requests } = makeSearch();
  const fields = (schemaName) => search.searchables[schemaName]?.fields;

  assert.equal(requests.length, 0);
  assert.deepEqual(fields('SalesInvoice'), ['name', 'party']);
  assert.deepEqual(fields('Party'), ['name', 'email', 'role', 'phone']);
  assert.deepEqual(fields('Tax'), ['name']);
  assert.equal(fields('SalesInvoiceItem'), undefined);
  assert.equal(fields('Account'), undefined);
});
test('filter chips show transactions first, by schema label', () => {
  const { search } = makeSearch();
  const labels = search.schemaFilterOptions.map(({ label }) => label);

  assert.deepEqual(labels.slice(0, 3), [
    'Journal Entry',
    'Payment',
    'Purchase Invoice',
  ]);
  assert.deepEqual(labels.slice(-2), ['Serial Number', 'Tax Template']);
  assert.equal(labels.length, 18);
});
test('one request searches the text in the doctypes the filters allow', async () => {
  const { search, requests } = makeSearch();
  await search.fetchDocs(' Karen SINV-1 ');
  search.set('skipTransactions', true);
  await search.fetchDocs('Karen');
  search.set('Docs', false);
  await search.fetchDocs('Karen');

  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, '/api/method/frappe_books.search.search');
  assert.equal(requests[0].body.text, 'Karen SINV-1');
  assert.equal(requests[0].body.doctypes.length, 18);
  assert.equal(requests[0].body.doctypes.includes('Books Sales Invoice'), true);
  assert.equal(requests[1].body.doctypes.includes('Books Sales Invoice'), false);
  assert.equal(requests[1].body.doctypes.includes('Books Party'), true);
});
test('the palette lists only the lists of features that are on', () => {
  const { AccountingSettings, InventorySettings } = fyo.singles;
  const lists = (accounting, inventory) => {
    fyo.singles.AccountingSettings = accounting;
    fyo.singles.InventorySettings = inventory;
    return makeSearch()
      .search.search('')
      .filter(({ group }) => group === 'List')
      .map(({ label }) => label);
  };
  const featureLists = [
    'Batch',
    'Custom Form',
    'Lead',
    'Price List',
    'Serial Number',
    'Stock Movement',
  ];
  try {
    const off = lists({}, undefined);
    const on = lists(
      {
        enable_form_customization: true,
        enable_inventory: true,
        enable_lead: true,
        enable_price_list: true,
      },
      { enable_batches: true, enable_serial_number: true }
    );

    assert.deepEqual(
      featureLists.filter((label) => off.includes(label)),
      []
    );
    assert.deepEqual(
      featureLists.filter((label) => on.includes(label)),
      featureLists
    );
    assert.equal(off.includes('Quote'), true);
  } finally {
    fyo.singles.AccountingSettings = AccountingSettings;
    fyo.singles.InventorySettings = InventorySettings;
  }
});

test('a superseded search is dropped and documents keep the server order', async () => {
  const pending = [];
  const { search } = makeSearch(
    () => new Promise((resolve) => pending.push(resolve))
  );
  const stale = search.fetchDocs('SINV');
  const latest = search.fetchDocs('SINV-100');
  await new Promise((resolve) => setImmediate(resolve));
  pending[1]([
    invoice('SINV-1002', 1),
    invoice('SINV-1001', 0),
    invoice('SINV-1003', 2),
  ]);
  assert.equal(await latest, true);
  pending[0]([invoice('SINV-9', 1)]);
  assert.equal(await stale, false);

  assert.deepEqual(
    docs(search, 'SINV-100').map((item) => [item.label, item.more]),
    [
      ['SINV-1002', ['Acme']],
      ['SINV-1001', ['Acme']],
      ['SINV-1003', ['Acme']],
    ]
  );
});
test('typed text changes the results once, when its documents arrive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [];
  const { search } = makeSearch(
    () => new Promise((resolve) => pending.push(resolve))
  );
  const app = createApp({});
  app.provide(searcherKey, shallowRef(search));
  const scope = effectScope();
  t.after(() => scope.stop());
  const { query, results } = scope.run(() => app.runWithContext(useSearch));
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const first = () => results.value[0]?.label;
  const before = first();

  query.value = 'SINV';
  await settle();
  t.mock.timers.tick(250);
  await settle();
  assert.equal(first(), before);

  pending[0]([invoice('SINV-1001', 1)]);
  await settle();
  assert.equal(
    results.value.find(({ group }) => group === 'Docs')?.label,
    'SINV-1001'
  );
});

test('lists, actions and reports come before documents', async () => {
  const { search } = makeSearch(() => [
    {
      doctype: 'Books Item',
      name: 'Cloud Hosting - Shared Starter',
      item_type: 'Service',
      item_usage: 'Sales',
    },
  ]);
  await search.fetchDocs('sales');
  const groups = search.search('sales').map(({ group }) => group);

  assert.notEqual(groups[0], 'Docs');
  assert.equal(groups.at(-1), 'Docs');
  assert.equal(groups.indexOf('Docs'), groups.length - 1);
});
test('a document shows its search fields and opens its form', async () => {
  const { search } = makeSearch(() => [
    {
      doctype: 'Books Party',
      name: 'Acme',
      email: 'acme@example.com',
      role: 'Customer',
      phone: '9876543210',
      docstatus: 0,
    },
  ]);
  await search.fetchDocs('Acme');

  assert.deepEqual(
    docs(search, 'Acme').map(({ label, more, schemaLabel, route }) => [
      label,
      more,
      schemaLabel,
      route,
    ]),
    [
      [
        'Acme',
        ['acme@example.com', 'Customer', '9876543210'],
        'Party',
        '/edit/Party/Acme',
      ],
    ]
  );
});
test('the palette lists every party under one Party list', () => {
  const { search } = makeSearch();
  const lists = search
    .search('Party')
    .filter(({ group, label }) => group === 'List' && label === 'Party');

  assert.deepEqual(
    lists.map(({ route }) => route),
    ['/list/Party']
  );
});

test('recent records reopen the record instead of a list', async () => {
  const { search } = makeSearch(() => [invoice('SINV-1001', 1)]);
  const stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  await search.fetchDocs('SINV-1001');

  const [record] = docs(search, 'SINV-1001');
  search.addToRecent(record);
  assert.equal(
    search.getRecentItems()[0].route,
    '/edit/SalesInvoice/SINV-1001'
  );
});

test('link options keep every server match, closest first', () => {
  const options = [
    { label: 'Acme Supplies' },
    { label: 'Northwind' },
    { label: 'ACME' },
  ];
  const labels = (items) => items.map(({ label }) => label);
  const getValues = ({ label }) => [label];

  assert.deepEqual(labels(sortByFuzzyMatch('acme', options, getValues)), [
    'ACME',
    'Acme Supplies',
    'Northwind',
  ]);
  assert.deepEqual(labels(sortByFuzzyMatch('acme', options, getValues, true)), [
    'ACME',
    'Acme Supplies',
  ]);
  assert.equal(sortByFuzzyMatch('', options, getValues), options);
});
