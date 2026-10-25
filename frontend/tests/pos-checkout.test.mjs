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
    const isMethods = body.doctype === 'Books Mode of Payment';
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

/** A previewed POS sale of 500 for Asha; the preview filled its item names and stock quantities. */
function makeSale(values = {}) {
  const sale = newFrappeDoc('SalesInvoice', {
    is_pos: true,
    naming_series: 'SINV-',
    customer: 'Asha',
    debit_to: 'Debtors',
    posting_date: new Date('2026-10-04T00:00:00Z'),
    items: [
      {
        item_code: 'Pen',
        item_name: 'Pen',
        income_account: 'Sales',
        qty: 2,
        stock_qty: 2,
        price_list_rate: fyo.pesa(250),
      },
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
  checkout.selectMethod(0, method);
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
  assert.equal(checkout.tenders[0].amount.float, 200);
  assert.equal(checkout.settlement, null);

  checkout.setAmount(0, fyo.pesa(150));
  assert.equal(checkout.settlement.label, 'Balance due');
  assert.equal(checkout.settlement.amount.float, 50);
  assert.equal(checkout.settlement.isChange, false);
});

test('cash beyond what is due is change, offered with round amounts', async () => {
  const checkout = await startCheckout(
    makeSale({ outstanding_amount: fyo.pesa(437) })
  );

  assert.deepEqual(amounts(checkout.getQuickAmounts(0)), [437, 440, 450]);
  checkout.setAmount(0, fyo.pesa(500));
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
  assert.deepEqual(amounts(checkout.getQuickAmounts(0)), [500]);
  checkout.setAmount(0, fyo.pesa(600));
  assert.equal(checkout.settlement, null);
});

/** Lets watchers run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('an amount still at what was due follows a coupon or points that change it', async () => {
  const sale = makeSale();
  const checkout = await startCheckout(sale);

  sale.outstanding_amount = fyo.pesa(450);
  await settle();
  assert.equal(checkout.tenders[0].amount.float, 450);

  checkout.setAmount(0, fyo.pesa(1000));
  sale.outstanding_amount = fyo.pesa(400);
  await settle();
  assert.equal(checkout.tenders[0].amount.float, 1000);
});

test('a tender can pay once it has a method, an amount and what the method needs', async () => {
  const checkout = usePOSCheckout(() => makeSale());
  await checkout.start();
  assert.equal(checkout.canPay, false);

  checkout.selectMethod(0, 'Cash');
  assert.equal(checkout.canPay, true);
  checkout.setAmount(0, null);
  assert.equal(checkout.canPay, false);

  checkout.selectMethod(0, 'Cheque');
  assert.deepEqual(checkout.getRequirements(0), {
    isCash: false,
    requiresReferenceId: true,
    requiresClearanceDate: true,
  });
  checkout.setReference(0, 'CHQ-77');
  assert.equal(checkout.canPay, false);
  checkout.setClearanceDate(0, new Date('2026-10-05T00:00:00Z'));
  assert.equal(checkout.canPay, true);
});

test('a method keeps only the payment details it needs', async () => {
  const checkout = await startCheckout(makeSale(), 'Cheque');
  checkout.setReference(0, 'CHQ-77');
  checkout.setClearanceDate(0, new Date('2026-10-05T00:00:00Z'));

  checkout.selectMethod(0, 'Card');
  const [tender] = checkout.tenders;
  assert.deepEqual(
    [tender.reference_no, tender.clearance_date],
    ['CHQ-77', undefined]
  );
  checkout.selectMethod(0, 'Cash');
  assert.equal(tender.reference_no, undefined);
});

test('a draft sale is submitted with the tender as its payment row', async () => {
  const sale = makeSale();
  const checkout = await startCheckout(sale, 'Card');
  checkout.setReference(0, 'TXN-9');
  requests.length = 0;

  const { invoice, payments } = await checkout.checkout({ pay: true });

  assert.equal(invoice, 'SINV-1001');
  assert.deepEqual(await payments, ['PAY-1001']);
  const [row] = getInserted().payments;
  assert.deepEqual(
    [row.mode_of_payment, Number(row.amount), row.reference_no],
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
    payments: [{ mode_of_payment: 'Cash', amount: fyo.pesa(500) }],
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
  checkout.setReference(0, 'CHQ-77');
  checkout.setClearanceDate(0, new Date('2026-10-05T12:00:00Z'));
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
        mode_of_payment: 'Cheque',
        amount: 200,
        reference_no: 'CHQ-77',
        clearance_date: '2026-10-05',
      },
    ],
  });
});

test('a reset tender starts again at what the next sale is due', async () => {
  const sale = shallowRef(makeSale());
  const checkout = usePOSCheckout(() => sale.value);
  await checkout.start();
  checkout.selectMethod(0, 'Cheque');
  checkout.setReference(0, 'CHQ-77');
  checkout.setAmount(0, fyo.pesa(100));
  checkout.addTender();

  checkout.reset();
  assert.equal(checkout.tenders.length, 1);
  const [tender] = checkout.tenders;
  assert.deepEqual(
    [tender.mode_of_payment, tender.amount.float, tender.reference_no],
    [undefined, 0, undefined]
  );

  sale.value = makeSale({ outstanding_amount: fyo.pesa(80) });
  await checkout.start();
  assert.equal(checkout.tenders[0].amount.float, 80);
  assert.equal(checkout.tenders[0].mode_of_payment, undefined);
});

test('another tender pays what the first leaves, with a method no tender has', async () => {
  const checkout = await startCheckout(makeSale(), 'Cash');
  assert.equal(checkout.canAddTender, false);

  checkout.setAmount(0, fyo.pesa(300));
  assert.deepEqual(
    [checkout.settlement.label, checkout.settlement.amount.float],
    ['Balance due', 200]
  );
  assert.equal(checkout.canAddTender, true);
  checkout.addTender();
  assert.equal(checkout.tenders[1].amount.float, 200);
  assert.equal(checkout.canPay, false);
  assert.deepEqual(
    checkout.getMethods(1).map(({ name }) => name),
    ['Card', 'Cheque']
  );

  checkout.selectMethod(1, 'Card');
  checkout.setReference(1, 'TXN-9');
  assert.equal(checkout.tenders[1].amount.float, 200);
  assert.equal(checkout.settlement, null);
  assert.equal(checkout.canPay, true);
  assert.deepEqual(amounts(checkout.getQuickAmounts(1)), [200]);
});

test('only cash gives change; non-cash beyond what is due cannot pay', async () => {
  const checkout = await startCheckout(makeSale(), 'Card');
  checkout.setReference(0, 'TXN-9');
  checkout.setAmount(0, fyo.pesa(300));
  checkout.addTender();
  checkout.selectMethod(1, 'Cash');
  checkout.setAmount(1, fyo.pesa(300));

  assert.deepEqual(
    [checkout.settlement.label, checkout.settlement.amount.float],
    ['Change to return', 100]
  );
  assert.equal(checkout.canPay, true);

  checkout.setAmount(0, fyo.pesa(600));
  assert.deepEqual(
    [checkout.settlement.label, checkout.settlement.amount.float],
    ['Non-cash over amount due', 100]
  );
  assert.equal(checkout.canPay, false);
});

test('a removed tender leaves the rest to the others', async () => {
  const checkout = await startCheckout(makeSale(), 'Cash');
  checkout.setAmount(0, fyo.pesa(300));
  checkout.addTender();
  checkout.selectMethod(1, 'Card');

  checkout.removeTender(1);
  assert.equal(checkout.tenders.length, 1);
  assert.equal(checkout.settlement.amount.float, 200);
  checkout.removeTender(0);
  assert.equal(checkout.tenders.length, 1);
});

test('a draft sale is submitted with a payment row per tender', async () => {
  const checkout = await startCheckout(makeSale(), 'Cash');
  checkout.setAmount(0, fyo.pesa(300));
  checkout.addTender();
  checkout.selectMethod(1, 'Card');
  checkout.setReference(1, 'TXN-9');
  requests.length = 0;

  await checkout.checkout({ pay: true });

  const rows = getInserted().payments.map((row) => [
    row.mode_of_payment,
    Number(row.amount),
    row.reference_no ?? null,
  ]);
  assert.deepEqual(rows, [
    ['Cash', 300, null],
    ['Card', 200, 'TXN-9'],
  ]);
});
