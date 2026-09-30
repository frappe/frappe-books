import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import {
  fyo,
  getDocType,
  getFrappeListPage,
  getSchema,
  ListFilters,
  loadTestDocTypes,
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

test('a list page and its count come from the REST API, newest first', async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count')
      ? { data: 42 }
      : { data: [{ name: 'Pen', rate: 12.5, track_item: 1 }] }
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
  assert.equal(list.path, '/api/v2/document/Books Item');
  assert.deepEqual(list.params, {
    fields: ['*'],
    filters: [
      ['item_type', '=', 'Product'],
      'and',
      [['name', 'like', '%pe%'], 'or', ['item_usage', 'like', '%pe%']],
    ],
    order_by: 'creation desc',
    start: 50,
    limit: 50,
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

test('a single search filter is ANDed without a group', async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { data: [] }
  );
  await getFrappeListPage(fyo, 'Item', {
    filters: {},
    orFilters: { name: ['like', '%pe%'] },
    start: 0,
    limit: 20,
  });
  assert.deepEqual(requests[0].params.filters, [['name', 'like', '%pe%']]);
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

test("a list is ordered by its DocType's sort field, newest first", async (t) => {
  const { meta } = getDocType('Order');
  t.after(() => delete meta.sort_field);
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { data: [] }
  );
  const page = { filters: {}, orFilters: {}, start: 0, limit: 20 };

  meta.sort_field = 'creation';
  await getFrappeListPage(fyo, 'Order', page);
  meta.sort_field = 'customer';
  await getFrappeListPage(fyo, 'Order', page);
  assert.deepEqual(
    requests
      .filter(({ path }) => !path.endsWith('/count'))
      .map(({ params }) => params.order_by),
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
