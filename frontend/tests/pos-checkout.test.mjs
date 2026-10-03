import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  newFrappeDoc,
  shallowRef,
  usePOSCheckout,
} from './helpers/frappe.mjs';

const paymentMethods = [
  { name: 'Cash', type: 'Cash', requires_clearance_date: 0 },
  { name: 'Card', type: 'Bank', requires_clearance_date: 0 },
  { name: 'Cheque', type: 'Bank', requires_clearance_date: 1 },
];

let isNextLookupDenied = false;
const requests = await loadFrappeModels(frappeModels, respond);
fyo.singles.AccountingSettings = {};

/** Answers as the server does for a POS checkout. */
function respond({ path, body }) {
  const method = path.split('.').pop();
  if (method === 'get_list' && isNextLookupDenied) {
    isNextLookupDenied = false;
    return { status: 417, body: { exc_type: 'PermissionError' } };
  }
  if (method === 'get_list') {
    const isMethods = body.doctype === 'Books Payment Method';
    return { message: isMethods ? paymentMethods : [{ parent: 'PAY-1001' }] };
  }
  if (method === 'get_sale_shortfalls') {
    return { message: [] };
  }
  if (method === 'pay_pos_invoice') {
    return { message: ['PAY-2001'] };
  }
  if (path === '/api/v2/document/Books Sales Invoice') {
    return { data: { ...withServerDefaults(body), name: 'SINV-1001' } };
  }
  if (path.endsWith('run_doc_method')) {
    const docstatus = body.method === 'submit' ? 1 : 0;
    return { docs: [{ ...withServerDefaults(body.document), docstatus }] };
  }
  return { data: [] };
}

function withServerDefaults(values) {
  return { ...values, make_auto_payment: 0, make_auto_stock_transfer: 1 };
}

/** A previewed POS sale of 500 for Asha. */
function makeSale(values = {}) {
  const sale = newFrappeDoc('SalesInvoice', {
    is_pos: true,
    number_series: 'SINV-',
    party: 'Asha',
    account: 'Debtors',
    date: new Date('2026-10-04T00:00:00Z'),
    items: [
      { item: 'Pen', account: 'Sales', quantity: 2, rate: fyo.pesa(250) },
    ],
    grand_total: fyo.pesa(500),
    base_grand_total: fyo.pesa(500),
    outstanding_amount: fyo.pesa(500),
    ...values,
  });
  return sale;
}

function markSubmitted(sale, name = 'SINV-0900') {
  Object.assign(sale, { name, docstatus: 1, _notInserted: false });
  return sale;
}

/** A checkout of `sale`, started, with `method` chosen. */
async function startCheckout(sale, method = 'Cash') {
  const checkout = usePOSCheckout(() => sale);
  await checkout.start();
  checkout.selectMethod(method);
  return checkout;
}

const amounts = (values) => values.map((value) => value.float);

/** The values the last checkout saved the sale with. */
function getInserted() {
  const path = '/api/v2/document/Books Sales Invoice';
  return requests.find((request) => request.path === path).body;
}

test('a partly paid sale is due what it still owes, and a short tender leaves a balance', async () => {
  const sale = markSubmitted(makeSale({ outstanding_amount: fyo.pesa(200) }));
  const checkout = await startCheckout(sale, 'Card');

  assert.equal(checkout.due.float, 200);
  assert.equal(checkout.tender.amount.float, 200);
  assert.equal(checkout.settlement, null);

  checkout.setAmount(fyo.pesa(150));
  assert.equal(checkout.settlement.label, 'Balance due');
  assert.equal(checkout.settlement.amount.float, 50);
  assert.equal(checkout.settlement.isChange, false);
});

test('cash beyond what is due is change, offered with round amounts', async () => {
  const checkout = await startCheckout(
    makeSale({ outstanding_amount: fyo.pesa(437) })
  );

  assert.deepEqual(amounts(checkout.quickAmounts), [437, 440, 450]);
  checkout.setAmount(fyo.pesa(500));
  assert.deepEqual(
    [checkout.settlement.label, checkout.settlement.amount.float],
    ['Change to return', 63]
  );
  assert.equal(checkout.settlement.isChange, true);
});

test('a refund is due its total and gives no change', async () => {
  const sale = makeSale({
    return_against: 'SINV-0800',
    grand_total: fyo.pesa(-500),
    outstanding_amount: fyo.pesa(-500),
  });
  const checkout = await startCheckout(sale);

  assert.equal(checkout.due.float, 500);
  assert.deepEqual(amounts(checkout.quickAmounts), [500]);
  checkout.setAmount(fyo.pesa(600));
  assert.equal(checkout.settlement, null);
});

/** Lets watchers run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('an amount still at what was due follows a coupon or points that change it', async () => {
  const sale = makeSale();
  const checkout = await startCheckout(sale);

  sale.outstanding_amount = fyo.pesa(450);
  await settle();
  assert.equal(checkout.tender.amount.float, 450);

  checkout.setAmount(fyo.pesa(1000));
  sale.outstanding_amount = fyo.pesa(400);
  await settle();
  assert.equal(checkout.tender.amount.float, 1000);
});

test('a tender can pay once it has a method, an amount and what the method needs', async () => {
  const checkout = usePOSCheckout(() => makeSale());
  await checkout.start();
  assert.equal(checkout.canPay, false);

  checkout.selectMethod('Cash');
  assert.equal(checkout.canPay, true);
  checkout.setAmount(null);
  assert.equal(checkout.canPay, false);

  checkout.selectMethod('Cheque');
  assert.deepEqual(checkout.requirements, {
    isCash: false,
    requiresReferenceId: true,
    requiresClearanceDate: true,
  });
  checkout.setReference('CHQ-77');
  assert.equal(checkout.canPay, false);
  checkout.setClearanceDate(new Date('2026-10-05T00:00:00Z'));
  assert.equal(checkout.canPay, true);
});

test('a method keeps only the payment details it needs', async () => {
  const checkout = await startCheckout(makeSale(), 'Cheque');
  checkout.setReference('CHQ-77');
  checkout.setClearanceDate(new Date('2026-10-05T00:00:00Z'));

  checkout.selectMethod('Card');
  assert.deepEqual(
    [checkout.tender.reference_id, checkout.tender.clearance_date],
    ['CHQ-77', undefined]
  );
  checkout.selectMethod('Cash');
  assert.equal(checkout.tender.reference_id, undefined);
});

test('a draft sale is submitted with the tender as its payment row', async () => {
  const sale = makeSale();
  const checkout = await startCheckout(sale, 'Card');
  checkout.setReference('TXN-9');
  requests.length = 0;

  const { invoice, payments } = await checkout.checkout({ pay: true });

  assert.equal(invoice, 'SINV-1001');
  assert.deepEqual(await payments, ['PAY-1001']);
  const [row] = getInserted().payments;
  assert.deepEqual(
    [row.payment_method, Number(row.amount), row.reference_id],
    ['Card', 500, 'TXN-9']
  );
  const paths = requests.map(({ path, body }) => body.method ?? path);
  assert.deepEqual(paths.slice(-2), [
    'submit',
    '/api/method/frappe.client.get_list',
  ]);
  assert.equal(sale.isSubmitted, true);
});

test('a draft sale submitted unpaid has no payment rows and names no payments', async () => {
  const sale = makeSale({
    payments: [{ payment_method: 'Cash', amount: fyo.pesa(500) }],
  });
  const checkout = usePOSCheckout(() => sale);
  requests.length = 0;

  const { payments } = await checkout.checkout({ pay: false });

  assert.deepEqual(await payments, []);
  assert.deepEqual(getInserted().payments, []);
});

test('a failed payment lookup does not fail the checkout', async () => {
  const sale = makeSale();
  const checkout = await startCheckout(sale);
  isNextLookupDenied = true;

  const { payments } = await checkout.checkout({ pay: true });

  assert.equal(sale.isSubmitted, true);
  await assert.rejects(payments);
});

test('a submitted sale is paid at the counter', async () => {
  const sale = markSubmitted(makeSale({ outstanding_amount: fyo.pesa(200) }));
  const checkout = await startCheckout(sale, 'Cheque');
  checkout.setReference('CHQ-77');
  checkout.setClearanceDate(new Date('2026-10-05T12:00:00Z'));
  requests.length = 0;

  const { invoice, payments } = await checkout.checkout({ pay: true });

  assert.equal(invoice, 'SINV-0900');
  assert.deepEqual(await payments, ['PAY-2001']);
  assert.equal(requests.length, 1);
  assert.match(requests[0].path, /pay_pos_invoice$/);
  assert.deepEqual(requests[0].body, {
    invoice: 'SINV-0900',
    payments: [
      {
        payment_method: 'Cheque',
        amount: 200,
        reference_id: 'CHQ-77',
        clearance_date: '2026-10-05',
      },
    ],
  });
});

test('a reset tender starts again at what the next sale is due', async () => {
  const sale = shallowRef(makeSale());
  const checkout = usePOSCheckout(() => sale.value);
  await checkout.start();
  checkout.selectMethod('Cheque');
  checkout.setReference('CHQ-77');

  checkout.reset();
  assert.deepEqual(
    [checkout.tender.payment_method, checkout.tender.amount.float],
    [undefined, 0]
  );
  assert.equal(checkout.tender.reference_id, undefined);

  sale.value = makeSale({ outstanding_amount: fyo.pesa(80) });
  await checkout.start();
  assert.equal(checkout.tender.amount.float, 80);
  assert.equal(checkout.tender.payment_method, undefined);
});
