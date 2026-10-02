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

test('the palette searches the schemas the DocType search fields name', () => {
  const { search, requests } = makeSearch();
  const fields = (schemaName) => search.searchables[schemaName]?.fields;

  assert.equal(requests.length, 0);
  assert.deepEqual(fields('SalesInvoice'), ['name', 'party']);
  assert.deepEqual(fields('Party'), ['name', 'email', 'role']);
  assert.deepEqual(fields('Tax'), ['name']);
  assert.deepEqual(fields('SalesInvoiceItem'), ['item', 'tax']);
  assert.equal(fields('Account'), undefined);
});

test('filter chips show transactions first and table rows last, by schema label', () => {
  const { search } = makeSearch();
  const labels = search.schemaFilterOptions.map(({ label }) => label);

  assert.deepEqual(labels.slice(0, 3), [
    'Journal Entry',
    'Payment',
    'Purchase Invoice',
  ]);
  assert.deepEqual(labels.slice(-2), [
    'Sales Quote Item',
    'Stock Movement Item',
  ]);
  assert.equal(labels.length, 24);
});

test('each doctype is searched for the letters of the longest word in order', async () => {
  const { search, requests } = makeSearch();
  search.set('skipTables', true);
  await search.fetchDocs(' ac SINV-1 ');
  const invoice = requests.find(
    ({ body }) => body.doctype === 'Books Sales Invoice'
  );

  assert.equal(invoice.path, '/api/method/frappe.desk.search.search_widget');
  assert.deepEqual(invoice.body, {
    doctype: 'Books Sales Invoice',
    txt: 'S%I%N%V%-%1',
    page_length: 20,
    filter_fields: ['name', 'party', 'docstatus'],
    as_dict: true,
  });
  // 18 doctypes and their number series
  assert.equal(requests.length, 19);
});

test('a word naming the doctype is matched by the palette, not by the server', async () => {
  const { search, requests } = makeSearch(({ body }) =>
    body.doctype === 'Books Sales Invoice' && body.txt === 'K%a%r%e%n'
      ? [{ name: 'SINV-1001', party: 'Karen', docstatus: 1 }]
      : []
  );
  const sent = async (text) => {
    requests.length = 0;
    await search.fetchDocs(text);
    return Object.fromEntries(
      requests.map(({ body }) => [
        body.doctype,
        body.txt ?? body.or_filters?.[0][2],
      ])
    );
  };

  const karen = await sent('Karen invoice');
  assert.equal(karen['Books Sales Invoice'], 'K%a%r%e%n');
  assert.equal(karen['Books Party'], 'i%n%v%o%i%c%e');
  assert.deepEqual(
    docs(search, 'Karen invoice').map(({ label }) => label),
    ['SINV-1001']
  );

  const jacket = await sent('Jacket purchase');
  assert.equal(jacket['Books Purchase Invoice Item'], '%J%a%c%k%e%t%');
  assert.equal(jacket['Books Sales Invoice Item'], '%p%u%r%c%h%a%s%e%');

  const salesInvoice = await sent('sales invoice');
  assert.equal(salesInvoice['Books Sales Invoice'], 'i%n%v%o%i%c%e');
});

test('a number series prefix is matched by the palette, not by the server', async () => {
  const { search, requests } = makeSearch(({ body }) =>
    body.doctype === 'Books Number Series'
      ? [
          { name: 'SINV-', reference_type: 'SalesInvoice' },
          { name: 'INV-26-', reference_type: 'SalesInvoice' },
        ]
      : []
  );
  search.set('skipTables', true);
  await search.fetchDocs('sinv 1001');
  await search.fetchDocs('1001 inv-26');
  const sent = (doctype) =>
    requests
      .filter(({ body }) => body.doctype === doctype)
      .map(({ body }) => body.txt);

  assert.equal(sent('Books Number Series').length, 1);
  assert.deepEqual(sent('Books Sales Invoice'), ['1%0%0%1', '1%0%0%1']);
  assert.deepEqual(sent('Books Purchase Invoice'), ['s%i%n%v', 'i%n%v%-%2%6']);
});

test('a user who cannot read number series searches without them', async () => {
  const { search, requests } = makeSearch();
  const { permissions } = fyo.store;
  fyo.store.permissions = {
    doctypes: { NumberSeries: 'Books Number Series' },
    user: { can_read: [] },
  };
  try {
    await search.fetchDocs('sinv 1001');
  } finally {
    fyo.store.permissions = permissions;
  }

  const doctypes = requests.map(({ body }) => body.doctype);
  assert.equal(doctypes.includes('Books Number Series'), false);
  assert.equal(doctypes.includes('Books Sales Invoice'), true);
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

test('a superseded search is dropped and documents rank by status', async () => {
  const pending = [];
  const { search } = makeSearch((request) =>
    request.body.doctype === 'Books Sales Invoice'
      ? new Promise((resolve) => pending.push(resolve))
      : []
  );
  const stale = search.fetchDocs('SINV');
  const latest = search.fetchDocs('SINV-100');
  await new Promise((resolve) => setImmediate(resolve));
  pending[1]([
    { name: 'SINV-1003', party: 'Acme', docstatus: 2 },
    { name: 'SINV-1001', party: 'Acme', docstatus: 0 },
    { name: 'SINV-1002', party: 'Acme', docstatus: 1 },
  ]);
  assert.equal(await latest, true);
  pending[0]([{ name: 'SINV-9', party: 'Old', docstatus: 1 }]);
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
  const { search } = makeSearch(({ body }) =>
    body.doctype === 'Books Sales Invoice'
      ? new Promise((resolve) => pending.push(resolve))
      : []
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

  pending[0]([{ name: 'SINV-1001', party: 'Acme', docstatus: 1 }]);
  await settle();
  assert.equal(first(), 'SINV-1001');
});

test('a word naming an action group lists those actions before records', async () => {
  const { search } = makeSearch(({ body }) =>
    body.doctype === 'Books Item'
      ? [
          {
            name: 'Cloud Hosting - Shared Starter',
            item_type: 'Service',
            item_usage: 'Sales',
          },
        ]
      : []
  );
  const first = async (input) => {
    await search.fetchDocs(input);
    const [item] = search.search(input);
    return [item.group, item.label];
  };

  assert.deepEqual(await first('create sales'), ['Create', 'Sales Invoice']);
  assert.deepEqual(await first('sales'), [
    'Docs',
    'Cloud Hosting - Shared Starter',
  ]);
});

test('a table row is found by its search fields and opens its parent', async () => {
  const { search, requests } = makeSearch(({ body }) =>
    body.doctype === 'Books Payment For'
      ? [
          {
            reference_name: 'SINV-1001',
            reference_type: 'Books Sales Invoice',
            parent: 'PAY-1001',
            parenttype: 'Books Payment',
          },
        ]
      : []
  );
  await search.fetchDocs('SINV-1001');
  const rows = requests.find(
    ({ body }) => body.doctype === 'Books Payment For'
  );

  assert.equal(rows.path, '/api/method/frappe.client.get_list');
  assert.deepEqual(rows.body, {
    doctype: 'Books Payment For',
    parent: 'Books Payment',
    fields: [
      'name',
      'reference_name',
      'reference_type',
      'parent',
      'parenttype',
    ],
    filters: [['parenttype', '=', 'Books Payment']],
    or_filters: [
      ['reference_name', 'like', '%S%I%N%V%-%1%0%0%1%'],
      ['reference_type', 'like', '%S%I%N%V%-%1%0%0%1%'],
    ],
    order_by: 'idx',
    limit_page_length: 20,
  });
  const [row] = docs(search, 'SINV-1001');
  assert.deepEqual(
    [row.label, row.more, row.schemaLabel, row.route],
    [
      'PAY-1001',
      ['SINV-1001', 'Sales'],
      'Payment For',
      '/edit/Payment/PAY-1001',
    ]
  );
});

test('a party shows its email and role, and is not found by its phone', async () => {
  const party = {
    name: 'Acme',
    email: 'acme@example.com',
    role: 'Customer',
    phone: '9876543210',
  };
  const { search, requests } = makeSearch(({ body }) =>
    body.doctype === 'Books Party' ? [party] : []
  );
  await search.fetchDocs('Acme');
  const sent = requests.find(({ body }) => body.doctype === 'Books Party');

  assert.deepEqual(sent.body.filter_fields, ['name', 'email', 'role']);
  assert.deepEqual(
    docs(search, 'Acme').map(({ label, more }) => [label, more]),
    [['Acme', ['acme@example.com', 'Customer']]]
  );

  await search.fetchDocs('98765');
  assert.deepEqual(docs(search, '98765'), []);
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
  const { search } = makeSearch(({ body }) =>
    body.doctype === 'Books Sales Invoice'
      ? [{ name: 'SINV-1001', party: 'Acme', docstatus: 1 }]
      : []
  );
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
