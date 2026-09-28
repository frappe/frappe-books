import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';
import { Search } from './helpers/ui.mjs';

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
