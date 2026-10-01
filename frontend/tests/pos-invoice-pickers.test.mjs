import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  pos,
  setLanguageMapOnTranslationString,
} from './helpers/frappe.mjs';

const invoice = {
  name: 'SINV-1001',
  party: 'Aarav Shah',
  date: '2026-09-06 10:00:00',
  grand_total: 1250,
  docstatus: 1,
};
const requests = await loadFrappeModels(frappeModels, ({ path }) =>
  path === '/api/method/frappe.client.get_list'
    ? { message: [invoice] }
    : { data: 21 }
);
const returnable = [['docstatus', '=', 1]];

test('a picker searches and pages POS invoices on the server', async () => {
  const [row] = await pos.getPOSInvoices(returnable, '0001', 20, 20);
  assert.equal(row.name, 'SINV-1001');
  assert.equal(row.grand_total.float, 1250);

  const { body } = requests.at(-1);
  assert.deepEqual(body.filters, [
    ['is_pos', '=', 1],
    ['docstatus', '=', 1],
    ['name', 'like', '%0001%'],
  ]);
  assert.deepEqual(
    [body.order_by, body.limit_start, body.limit_page_length],
    ['creation desc', 20, 20]
  );
});

test('a picker counts the POS invoices its search matches', async () => {
  assert.equal(await pos.getPOSInvoiceCount(returnable, '0001'), 21);
  const { path, params } = requests.at(-1);
  assert.equal(path, '/api/v2/doctype/Books Sales Invoice/count');
  assert.deepEqual(params.filters, [
    ['is_pos', '=', 1],
    ['docstatus', '=', 1],
    ['name', 'like', '%0001%'],
  ]);
});

test('without a search a picker loads every matching POS invoice', async () => {
  await pos.getPOSInvoices(returnable);
  const { body } = requests.at(-1);
  assert.deepEqual(body.filters, [
    ['is_pos', '=', 1],
    ['docstatus', '=', 1],
  ]);
  assert.equal(body.limit_page_length, 0);
});

test('the picker columns are translated', () => {
  setLanguageMapOnTranslationString({
    Name: { translation: 'Nom' },
    Customer: { translation: 'Client' },
    Date: { translation: 'Date' },
    'Grand Total': { translation: 'Total général' },
  });
  try {
    assert.deepEqual(
      pos.getPOSInvoiceFields().map(({ label }) => label),
      ['Nom', 'Client', 'Date', 'Total général']
    );
  } finally {
    setLanguageMapOnTranslationString(undefined);
  }
});
