import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';
import { Search, sortByFuzzyMatch } from './helpers/ui.mjs';

test('search starts without loading documents and fetches a bounded match set', async () => {
  const fyo = await makeFyo();
  const requests = [];
  const responses = [];
  fyo.db.search = (...args) => {
    requests.push(args);
    return new Promise((resolve) => responses.push(resolve));
  };
  const search = new Search(fyo);
  search.initialize();
  assert.equal(requests.length, 0);

  const stale = search.fetchDocs('SINV');
  const latest = search.fetchDocs('SINV-1001');
  const [text, schemaNames, limit] = requests.at(-1);
  assert.equal(text, 'SINV-1001');
  assert.ok(schemaNames.includes('SalesInvoice'));
  assert.equal(limit, 20);

  responses[1]({
    SalesInvoice: [{ name: 'SINV-1001', party: 'Acme', submitted: true }],
  });
  assert.equal(await latest, true);
  responses[0]({ SalesInvoice: [{ name: 'SINV-9', party: 'Old' }] });
  assert.equal(await stale, false);

  const docs = search
    .search('SINV-1001')
    .filter((item) => item.group === 'Docs');
  assert.deepEqual(
    docs.map((item) => [item.label, item.more]),
    [['SINV-1001', ['Acme']]]
  );
});

test('recent records reopen the record instead of a list', async () => {
  const fyo = await makeFyo();
  fyo.db.search = async () => ({
    SalesInvoice: [{ name: 'SINV-1001', party: 'Acme' }],
  });
  const stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  const search = new Search(fyo);
  search.initialize();
  await search.fetchDocs('SINV-1001');

  const [record] = search
    .search('SINV-1001')
    .filter((item) => item.group === 'Docs');
  search.addToRecent(record);
  assert.equal(
    search.getRecentItems()[0].route,
    '/edit/SalesInvoice/SINV-1001'
  );
});

test('the palette searches the schemas the DocType search fields name', async () => {
  const fyo = await makeFyo();
  const search = new Search(fyo);
  search.initialize();
  const fields = (schemaName) => search.searchables[schemaName]?.fields;

  assert.deepEqual(fields('SalesInvoice'), ['name', 'party']);
  assert.deepEqual(fields('Party'), ['name', 'email', 'role', 'phone']);
  assert.deepEqual(fields('Tax'), ['name']);
  assert.deepEqual(fields('SalesInvoiceItem'), ['item', 'tax']);
  assert.equal(fields('Account'), undefined);
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
  assert.deepEqual(
    labels(sortByFuzzyMatch('acme', options, getValues, true)),
    ['ACME', 'Acme Supplies']
  );
  assert.equal(sortByFuzzyMatch('', options, getValues), options);
});
