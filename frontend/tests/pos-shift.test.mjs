import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  newFrappeDoc,
  pos,
} from './helpers/frappe.mjs';

const OPEN_SHIFT =
  'frappe_books.frappe_books.doctype.books_pos_opening_shift.books_pos_opening_shift.get_open_shift';
const openingShift = {
  name: 'SHIFT-1',
  docstatus: 1,
  opening_date: '2026-10-01 09:00:00',
  opening_cash: [{ name: 'oc-1', denomination: 100, count: 2 }],
  opening_amounts: [{ name: 'oa-1', payment_method: 'Cash', amount: 200 }],
};
let openShift = null;

const requests = await loadFrappeModels(frappeModels, (request) => {
  const { path, body } = request;
  if (path === `/api/method/${OPEN_SHIFT}`) {
    return { message: openShift };
  }

  if (path === '/api/method/frappe.client.get_list') {
    return { message: [{ name: 'Cash' }, { name: 'Petty Cash' }] };
  }

  if (path.endsWith('/Books Pos Opening Shift/SHIFT-1')) {
    return { data: openingShift };
  }

  if (path.endsWith('run_doc_method')) {
    return { docs: [previewClosing(body.document)] };
  }

  return { data: [] };
});

/** The server's closing preview: the open shift's rows, keeping the rows it was sent. */
function previewClosing(document) {
  const [sent] = document.closing_amounts ?? [];
  return {
    ...document,
    opening_shift: 'SHIFT-1',
    closing_amounts: [
      {
        name: sent?.name ?? null,
        payment_method: 'Cash',
        opening_amount: 200,
        closing_amount: sent?.closing_amount ?? 0,
        expected_amount: 350,
        difference_amount: (sent?.closing_amount ?? 0) - 350,
      },
    ],
  };
}

test('shift tables show the columns their bridge schemas showed', () => {
  const columns = Object.fromEntries(
    ['OpeningCash', 'OpeningAmounts', 'ClosingCash', 'ClosingAmounts'].map(
      (schemaName) => [schemaName, getSchema(schemaName).tableFields]
    )
  );
  assert.deepEqual(columns, {
    OpeningCash: ['denomination', 'count'],
    OpeningAmounts: ['payment_method', 'amount'],
    ClosingCash: ['denomination', 'count'],
    ClosingAmounts: [
      'payment_method',
      'opening_amount',
      'closing_amount',
      'expected_amount',
      'difference_amount',
    ],
  });
});

test('the POS opens a new shift unless one is open', async () => {
  openShift = null;
  const opening = await pos.getPOSOpeningShiftDoc();
  assert.equal(opening.notInserted, true);
  assert.equal(opening.schemaName, 'POSOpeningShift');

  openShift = 'SHIFT-1';
  const open = await pos.getPOSOpeningShiftDoc();
  assert.equal(open.name, 'SHIFT-1');
  assert.equal(open.openingCashAmount.float, 200);
  assert.equal(open.opening_amounts[0].payment_method, 'Cash');
});

test('cash methods are all the payment methods of the Cash type', async () => {
  requests.length = 0;
  assert.deepEqual(await pos.getCashPaymentMethods(), ['Cash', 'Petty Cash']);
  assert.deepEqual(requests[0].body, {
    doctype: 'Books Payment Method',
    fields: ['name'],
    filters: [['type', '=', 'Cash']],
    order_by: 'creation desc',
    limit_page_length: 0,
  });
});

test('a closing shift shows the server expected amounts and keeps its rows', async () => {
  const closing = newFrappeDoc('POSClosingShift', {
    closing_cash: [{ denomination: fyo.pesa(100), count: 3 }],
  });
  clearTimeout(closing._previewTimer);
  await closing.preview();
  assert.equal(closing.opening_shift, 'SHIFT-1');
  assert.equal(closing.closingCashAmount.float, 300);

  const [row] = closing.closing_amounts;
  assert.equal(row.expected_amount.float, 350);
  row.closing_amount = fyo.pesa(300);
  await closing.closing_cash[0].set('count', 4);
  await closing.preview();
  assert.equal(closing.closing_amounts[0], row);
  assert.equal(row.difference_amount.float, -50);
});
