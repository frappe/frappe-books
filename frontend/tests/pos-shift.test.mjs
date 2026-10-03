import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  newFrappeDoc,
  posShift,
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
    return {
      message: [
        { name: 'Cash', type: 'Cash' },
        { name: 'Till', type: 'Cash' },
        { name: 'Card', type: 'Bank' },
      ],
    };
  }

  if (path.endsWith('/Books Pos Opening Shift/SHIFT-1')) {
    return { data: openingShift };
  }

  if (path.endsWith('run_doc_method')) {
    const { document } = body;
    const isOpening = document.doctype === 'Books Pos Opening Shift';
    return { docs: [isOpening ? previewOpening(document) : previewClosing(document)] };
  }

  return { data: [] };
});

/** The server's opening preview: the first row takes the counted cash. */
function previewOpening(document) {
  const [first, ...rest] = document.opening_amounts;
  const counted = document.opening_cash.reduce(
    (total, row) => total + Number(row.denomination) * row.count,
    0
  );
  return { ...document, opening_amounts: [{ ...first, amount: counted }, ...rest] };
}

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

test('shift tables show the columns they showed', () => {
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

test('shift table headings show only their labels; the hints are placeholders', () => {
  const fields = ['OpeningCash', 'ClosingAmounts'].flatMap(
    (schemaName) => getSchema(schemaName).fields
  );
  assert.deepEqual(
    fields.filter((field) => field.sub_label).map((field) => field.fieldname),
    []
  );
  assert.equal(
    getSchema('ClosingAmounts').fields.find(
      (field) => field.fieldname === 'expected_amount'
    ).placeholder,
    'Expected Amount'
  );
});

test('a shift shows once it opens and goes once it closes', async () => {
  const shift = posShift.usePOSShift();
  assert.equal(shift.isLoaded, false);

  openShift = null;
  await shift.refresh();
  assert.deepEqual([shift.isLoaded, shift.isOpen], [true, false]);
  assert.equal(shift.openedAt, undefined);

  openShift = 'SHIFT-1';
  await shift.refresh();
  assert.equal(shift.isOpen, true);
  // Frappe sends the opening time in the system time zone, Asia/Kolkata here.
  assert.equal(shift.openedAt.toISOString(), '2026-10-01T03:30:00.000Z');
  assert.equal(shift.openShift.openingCashAmount.float, 200);

  openShift = null;
  await shift.refresh();
  assert.equal(shift.isOpen, false);
  assert.equal(shift.openShift, undefined);
});

test('cash methods are the payment methods of the Cash type, whatever their name', async () => {
  const shift = posShift.usePOSShift();
  await shift.refresh();
  assert.deepEqual(shift.cashMethods, ['Cash', 'Till']);
  assert.deepEqual(Object.keys(shift.methodTypes), ['Cash', 'Till', 'Card']);
});

test('a closing shift shows the server expected amounts and keeps its rows', async () => {
  const closing = newFrappeDoc('POSClosingShift', {
    closing_cash: [{ denomination: fyo.pesa(100), count: 3 }],
  });
  clearTimeout(closing._previewTimer);
  await closing.preview();
  assert.equal(closing.opening_shift, 'SHIFT-1');

  const [row] = closing.closing_amounts;
  assert.equal(row.expected_amount.float, 350);
  row.closing_amount = fyo.pesa(300);
  await closing.closing_cash[0].set('count', 4);
  await closing.preview();
  assert.equal(closing.closing_amounts[0], row);
  assert.equal(row.difference_amount.float, -50);
});

test('an opening shift takes its cash amount from the server preview', async () => {
  const opening = newFrappeDoc('POSOpeningShift', {
    opening_cash: [{ denomination: fyo.pesa(50), count: 3 }],
    opening_amounts: [{ payment_method: 'Cash', amount: fyo.pesa(0) }],
  });
  clearTimeout(opening._previewTimer);
  requests.length = 0;
  await opening.preview();

  assert.equal(opening.opening_amounts[0].amount.float, 150);
  const [{ body }] = requests;
  assert.deepEqual(
    [body.method, body.document.doctype],
    ['preview', 'Books Pos Opening Shift']
  );
});
