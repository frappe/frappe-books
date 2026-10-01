import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import {
  fyo,
  getDocType,
  getFrappeListPage,
  getFrappeRows,
  getSchema,
  isSortableField,
  ListFilters,
  loadListData,
  loadTestDocTypes,
  onListChange,
  searchFrappeLink,
  stubFrappe,
} from './helpers/frappe.mjs';

await loadTestDocTypes();

test('Submitted and Cancelled filters become docstatus filters', () => {
  const filters = new ListFilters('Order');
  filters.filterSet.add('submitted', '=', true);
  filters.filterSet.add('cancelled', '=', 0);
  filters.filterSet.add('submitted', '!=', 1);
  filters.filterSet.add('cancelled', '=', '1');
  assert.deepEqual(filters.apply(), [
    ['docstatus', 'in', [1, 2]],
    ['docstatus', 'not in', [2]],
    ['docstatus', 'not in', [1, 2]],
    ['docstatus', 'in', [2]],
  ]);
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
    filters: [['item_type', '=', 'Product']],
    orFilters: [
      ['name', 'like', '%pe%'],
      ['item_usage', 'like', '%pe%'],
    ],
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
    filters: [['customer', 'like', 'Acme%']],
    activeFilters: [],
    orFilters: [],
    requestId: 0,
    pageStart: 100,
    pageLength: 50,
  };
  const query = [['amount', '>', 5]];
  const first = loadListData(fyo, list, query);
  pages.shift()({ message: [{ name: 'ORD-1', customer: 'Acme' }] });
  const loaded = await first;

  assert.deepEqual(
    loaded.rows.map((row) => row.name),
    ['ORD-1']
  );
  assert.equal(loaded.total, 2);
  assert.deepEqual(loaded.appliedFilters, [...list.filters, ...query]);
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

  const old = loadListData(fyo, list, [['customer', '=', 'Old']]);
  const latest = loadListData(fyo, list, []);
  const oldPage = pages.shift();
  pages.shift()({ message: [{ name: 'ORD-2' }] });
  assert.equal((await latest).rows[0].name, 'ORD-2');
  oldPage({ message: [{ name: 'ORD-0' }] });
  assert.equal(await old, undefined);
  assert.deepEqual(list.activeFilters, []);
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
  const rice = { name: 'RICE-1', label: 'Basmati Rice' };
  const requests = stubFrappe(() => ({ message: [{ name: 'Rice' }, rice] }));
  const options = await searchFrappeLink(
    'Item',
    ' rce ',
    [
      ['item_usage', 'not in', ['Purchases']],
      ['track_item', '=', 1],
    ],
    50
  );

  assert.deepEqual(options, [
    { label: 'Rice', value: 'Rice', record: { name: 'Rice' } },
    { label: 'Basmati Rice', value: 'RICE-1', record: rice },
  ]);
  assert.equal(
    requests[0].path,
    '/api/method/frappe.desk.search.search_widget'
  );
  assert.deepEqual(requests[0].body, {
    doctype: 'Books Item',
    txt: 'r%c%e',
    filters: [
      ['item_usage', 'not in', ['Purchases']],
      ['track_item', '=', 1],
    ],
    filter_fields: [],
    page_length: 50,
    as_dict: true,
  });
});

test("a list is ordered by its DocType's sort field, newest first", async (t) => {
  const { meta } = getDocType('Order');
  t.after(() => delete meta.sort_field);
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { message: [] }
  );
  const page = { filters: [], orFilters: [], start: 0, limit: 20 };

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

test('a sorted list is ordered by its column, newest first among equal values', async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { message: [] }
  );
  const list = {
    schemaName: 'Order',
    filters: [],
    activeFilters: [],
    orFilters: [],
    requestId: 0,
    pageStart: 0,
    pageLength: 20,
    sort: { fieldname: 'customer', direction: 'asc' },
  };

  await loadListData(fyo, list);
  list.sort = { fieldname: 'creation', direction: 'asc' };
  await loadListData(fyo, list);
  assert.deepEqual(
    requests
      .filter(({ path }) => !path.endsWith('/count'))
      .map(({ body }) => body.order_by),
    ['customer asc, creation desc', 'creation asc']
  );
});

test('a list sorts only by the columns its DocType stores', (t) => {
  const customer = getDocType('Order').meta.fields[0];
  t.after(() => delete customer.is_virtual);

  assert.ok(isSortableField('Order', 'customer'));
  assert.ok(isSortableField('Order', 'name'));
  assert.ok(isSortableField('Order', 'creation'));
  assert.ok(!isSortableField('Order', 'status'));
  customer.is_virtual = 1;
  assert.ok(!isSortableField('Order', 'customer'));
});

test('a submittable list filters Submitted and Cancelled by docstatus', () => {
  const fieldnames = getFilterFields(getSchema('Order').fields).map(
    ({ fieldname }) => fieldname
  );
  assert.deepEqual(fieldnames.slice(-2), ['submitted', 'cancelled']);
  assert.ok(!fieldnames.includes('docstatus'));
});
