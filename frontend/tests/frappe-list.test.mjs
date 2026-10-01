import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import {
  fyo,
  getDocType,
  getFrappeListPage,
  getFrappeRows,
  getSchema,
  ListFilters,
  loadListData,
  loadTestDocTypes,
  onListChange,
  searchFrappeLink,
  stubFrappe,
  toFrappeFilters,
} from './helpers/frappe.mjs';

await loadTestDocTypes();

test('Books list filters become Frappe filters', () => {
  assert.deepEqual(
    toFrappeFilters({
      item_type: 'Product',
      track_item: true,
      rate: ['>=', 5, '<=', 10],
      item_usage: ['not in', ['Sales']],
      description: ['includes', 'blue'],
      barcode: ['is null', null],
      hsn_code: ['is not null', null],
    }),
    [
      ['item_type', '=', 'Product'],
      ['track_item', '=', 1],
      ['rate', '>=', 5],
      ['rate', '<=', 10],
      ['item_usage', 'not in', ['Sales']],
      ['description', 'like', '%blue%'],
      ['barcode', 'is', 'not set'],
      ['hsn_code', 'is', 'set'],
    ]
  );
});

test('Submitted and Cancelled filters become docstatus filters', () => {
  assert.deepEqual(toFrappeFilters({ submitted: true, cancelled: ['=', 0] }), [
    ['docstatus', 'in', [1, 2]],
    ['docstatus', 'not in', [2]],
  ]);
  assert.deepEqual(
    toFrappeFilters({ submitted: ['!=', 1], cancelled: ['=', '1'] }),
    [
      ['docstatus', 'not in', [1, 2]],
      ['docstatus', 'in', [2]],
    ]
  );
});

test('submittable lists offer the Submitted and Cancelled filters', () => {
  const options = (schemaName) =>
    new ListFilters(schemaName).fieldOptions.map(({ value }) => value);

  assert.ok(options('Order').includes('submitted'));
  assert.ok(options('Order').includes('cancelled'));
  assert.ok(!options('Item').includes('submitted'));
});

test("a list page and its count come from Frappe's list query, newest first", async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count')
      ? { data: 42 }
      : { message: [{ name: 'Pen', rate: 12.5, track_item: 1 }] }
  );
  const { rows, total } = await getFrappeListPage(fyo, 'Item', {
    filters: { item_type: 'Product' },
    orFilters: { name: ['like', '%pe%'], item_usage: ['like', '%pe%'] },
    start: 50,
    limit: 50,
  });

  assert.equal(total, 42);
  assert.equal(rows[0].rate.float, 12.5);
  assert.equal(rows[0].track_item, true);
  assert.equal(rows[0].schema.name, 'Item');

  const [list, count] = requests;
  assert.equal(list.path, '/api/method/frappe.client.get_list');
  assert.deepEqual(list.body, {
    doctype: 'Books Item',
    fields: ['*'],
    filters: [['item_type', '=', 'Product']],
    or_filters: [
      ['name', 'like', '%pe%'],
      ['item_usage', 'like', '%pe%'],
    ],
    order_by: 'creation desc',
    limit_start: 50,
    limit_page_length: 50,
  });
  assert.equal(count.path, '/api/v2/doctype/Books Item/count');
  assert.deepEqual(count.params, {
    filters: [['item_type', '=', 'Product']],
    or_filters: [
      ['name', 'like', '%pe%'],
      ['item_usage', 'like', '%pe%'],
    ],
  });
});

test('a list keeps its filters on refresh and drops a stale page', async () => {
  const pages = [];
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count')
      ? { data: 2 }
      : new Promise((resolve) => pages.push(resolve))
  );
  const list = {
    schemaName: 'Order',
    filters: { customer: ['like', 'Acme%'] },
    activeFilters: {},
    orFilters: {},
    requestId: 0,
    pageStart: 100,
    pageLength: 50,
  };
  const query = { amount: ['>', 5] };
  const first = loadListData(fyo, list, query);
  pages.shift()({ message: [{ name: 'ORD-1', customer: 'Acme' }] });
  const loaded = await first;

  assert.deepEqual(
    loaded.rows.map((row) => row.name),
    ['ORD-1']
  );
  assert.equal(loaded.total, 2);
  assert.deepEqual(loaded.appliedFilters, { ...list.filters, ...query });
  assert.deepEqual(requests[0].body.filters, [
    ['customer', 'like', 'Acme%'],
    ['amount', '>', 5],
  ]);
  assert.deepEqual(
    [requests[0].body.limit_start, requests[0].body.limit_page_length],
    [0, 50]
  );

  const refresh = loadListData(fyo, list);
  pages.shift()({ message: [] });
  await refresh;
  assert.deepEqual(list.activeFilters, query);

  const old = loadListData(fyo, list, { customer: 'Old' });
  const latest = loadListData(fyo, list, {});
  const oldPage = pages.shift();
  pages.shift()({ message: [{ name: 'ORD-2' }] });
  assert.equal((await latest).rows[0].name, 'ORD-2');
  oldPage({ message: [{ name: 'ORD-0' }] });
  assert.equal(await old, undefined);
  assert.deepEqual(list.activeFilters, {});
});

test('a submittable list refreshes after a submit, cancel, save, delete or rename', () => {
  const events = [];
  const fyoStub = { observer: { on: (event) => events.push(event) } };
  onListChange(fyoStub, 'Order', async () => {});
  assert.deepEqual(events, [
    'submit:Order',
    'cancel:Order',
    'sync:Order',
    'delete:Order',
    'rename:Order',
  ]);
});

test('documents by name come newest first, with the values forms show', async () => {
  const requests = stubFrappe(() => ({
    data: [{ name: 'Pen', rate: 12.5, track_item: 1 }],
  }));
  const fields = ['name', 'rate', 'track_item'];
  const [pen] = await getFrappeRows(fyo, 'Item', ['Pen', 'Ink'], fields);

  assert.deepEqual(
    [pen.name, pen.rate.float, pen.track_item],
    ['Pen', 12.5, true]
  );
  assert.equal(requests[0].path, '/api/v2/document/Books Item');
  assert.deepEqual(requests[0].params, {
    fields,
    filters: [['name', 'in', ['Pen', 'Ink']]],
    order_by: 'creation desc',
    limit: 2,
  });
});

test("link options come from Frappe's link search, letters matched in order", async () => {
  const requests = stubFrappe(() => ({
    message: [{ value: 'Rice' }, { value: 'RICE-1', label: 'Basmati Rice' }],
  }));
  const options = await searchFrappeLink(
    'Item',
    ' rce ',
    { item_usage: ['not in', ['Purchases']], track_item: true },
    50
  );

  assert.deepEqual(options, [
    { label: 'Rice', value: 'Rice' },
    { label: 'Basmati Rice', value: 'RICE-1' },
  ]);
  assert.equal(requests[0].path, '/api/method/frappe.desk.search.search_link');
  assert.deepEqual(requests[0].body, {
    doctype: 'Books Item',
    txt: 'r%c%e',
    filters: [
      ['item_usage', 'not in', ['Purchases']],
      ['track_item', '=', 1],
    ],
    page_length: 50,
  });
});

test('link options are grouped by a field of their records, as the journal entry groups accounts', async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('search_link')
      ? { message: [{ value: 'Pen' }, { value: 'Ink' }] }
      : { data: [{ name: 'Ink', item_type: 'Product' }, { name: 'Pen', item_type: 'Service' }] }
  );
  const options = await searchFrappeLink('Item', '', null, 50, 'item_type');

  assert.deepEqual(options, [
    { label: 'Pen', value: 'Pen', group: 'Service' },
    { label: 'Ink', value: 'Ink', group: 'Product' },
  ]);
  assert.deepEqual(requests[1].params.fields, ['name', 'item_type']);
  assert.deepEqual(requests[1].params.filters, [['name', 'in', ['Pen', 'Ink']]]);
});

test("a list is ordered by its DocType's sort field, newest first", async (t) => {
  const { meta } = getDocType('Order');
  t.after(() => delete meta.sort_field);
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { message: [] }
  );
  const page = { filters: {}, orFilters: {}, start: 0, limit: 20 };

  meta.sort_field = 'creation';
  await getFrappeListPage(fyo, 'Order', page);
  meta.sort_field = 'customer';
  await getFrappeListPage(fyo, 'Order', page);
  assert.deepEqual(
    requests
      .filter(({ path }) => !path.endsWith('/count'))
      .map(({ body }) => body.order_by),
    ['creation desc', 'customer desc, creation desc']
  );
});

test('a submittable list filters Submitted and Cancelled by docstatus', () => {
  const fieldnames = getFilterFields(getSchema('Order').fields).map(
    ({ fieldname }) => fieldname
  );
  assert.deepEqual(fieldnames.slice(-2), ['submitted', 'cancelled']);
  assert.ok(!fieldnames.includes('docstatus'));

  assert.deepEqual(
    toFrappeFilters({
      submitted: true,
      cancelled: ['!=', 1],
    }),
    [
      ['docstatus', 'in', [1, 2]],
      ['docstatus', 'not in', [2]],
    ]
  );
  assert.deepEqual(toFrappeFilters({ submitted: ['=', 0] }), [
    ['docstatus', 'not in', [1, 2]],
  ]);
});
