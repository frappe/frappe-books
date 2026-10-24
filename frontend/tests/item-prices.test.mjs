import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frappeModels,
  fyo,
  getEmptyState,
  getModel,
  getSearchFilters,
  LinkedRecordsSection,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';

let respond = () => ({ data: [] });
const requests = await loadFrappeModels(frappeModels, (request) =>
  respond(request)
);

/** The section's script on `doc`, its computed values read live, as Vue runs it. */
function makeSection(config, doc) {
  const { computed, methods } = LinkedRecordsSection;
  const section = { doc, config, rows: [], total: 0, t: fyo.t.bind(fyo) };
  for (const [key, get] of Object.entries(computed)) {
    Object.defineProperty(section, key, { get: () => get.call(section) });
  }
  for (const [key, method] of Object.entries(methods)) {
    section[key] = method.bind(section);
  }
  return section;
}

const prices = (linkField) =>
  getModel(linkField === 'item_code' ? 'Item' : 'PriceList').getLinkedRecords(
    fyo
  );

test('items and price lists list their prices while price lists are on', () => {
  fyo.singles.AccountingSettings = {};
  assert.equal(prices('item_code'), undefined);

  fyo.singles.AccountingSettings = { enable_price_list: true };
  const fieldnames = (config) =>
    config.columns.map((column) => column.fieldname ?? column);
  assert.deepEqual(fieldnames(prices('item_code')), [
    'price_list',
    'uom',
    'price_list_rate',
    'valid_from',
    'valid_upto',
  ]);
  assert.deepEqual(fieldnames(prices('price_list')), [
    'item_code',
    'uom',
    'price_list_rate',
    'valid_from',
    'valid_upto',
  ]);
  assert.equal(
    prices('item_code').emptyMessage,
    'No item prices for this item'
  );
  assert.equal(
    prices('price_list').emptyMessage,
    'No item prices in this price list'
  );
});

test("a form's prices are its first 20, with View all for more, and phone rows show the dates as a range", async () => {
  fyo.singles.AccountingSettings = { enable_price_list: true };
  respond = ({ path }) =>
    path.endsWith('/count')
      ? { data: 21 }
      : {
          message: [
            {
              name: 'p1',
              price_list: 'Retail',
              uom: 'Unit',
              price_list_rate: 400,
              valid_from: '2026-01-01',
            },
            {
              name: 'p2',
              price_list: 'Retail',
              uom: 'Unit',
              price_list_rate: 380,
              valid_from: '2025-01-01',
              valid_upto: '2025-12-31',
            },
          ],
        };
  requests.length = 0;
  const section = makeSection(prices('item_code'), {
    name: 'Tea',
    notInserted: false,
  });

  await section.load();

  const list = requests.find(
    ({ body }) => body?.doctype === 'Books Item Price'
  );
  assert.deepEqual(list.body.filters, [['item_code', '=', 'Tea']]);
  assert.equal(list.body.limit_page_length, 20);
  assert.equal(section.hasMore, true);
  const [from, range] = section.rows.map((row) => section.getMeta(row));
  assert.match(from, /^Retail · Unit · from /);
  assert.match(range, /^Retail · Unit · .+ – .+$/);
  assert.equal(section.getValue(section.rows[0], section.columns.at(-1)), '—');
});

test('an unsaved document lists no prices', async () => {
  requests.length = 0;
  const section = makeSection(prices('price_list'), { notInserted: true });

  await section.load();
  assert.equal(section.isShown, false);
  assert.equal(requests.length, 0);
});

test('an empty list says what the model says, filtered or not', () => {
  const config = getModel('ItemPrice').getListViewSettings(fyo);
  const fallback = { title: 'No entries found', createLabel: 'Make entry' };

  assert.deepEqual(getEmptyState(config, false, fallback), {
    title: 'No item prices',
    description: 'Each Item Price sets a rate for one item in one price list.',
    createLabel: 'New item price',
  });
  // The filtered title stands alone, without the fallback's description.
  const described = { ...fallback, description: 'Create one to get started.' };
  assert.deepEqual(getEmptyState(config, true, described), {
    title: 'No item prices match these filters',
    description: undefined,
    createLabel: 'Make entry',
  });
  assert.deepEqual(getEmptyState({}, false, fallback), fallback);
});

test('the list searches items and filters by price list above its rows', () => {
  const { filterBar } = getModel('ItemPrice').getListViewSettings(fyo);
  assert.deepEqual(filterBar, {
    searchPlaceholder: 'Search item…',
    linkField: 'price_list',
    allLabel: 'All price lists',
  });

  assert.deepEqual(getSearchFilters(['name', 'item_code'], '  Tea '), [
    ['name', 'like', '%Tea%'],
    ['item_code', 'like', '%Tea%'],
  ]);
  assert.deepEqual(getSearchFilters(['item_code'], '   '), []);
});
