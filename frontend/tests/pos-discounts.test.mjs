import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  getFrappeDoc,
  newFrappeDoc,
  posDiscounts,
} from './helpers/frappe.mjs';

const {
  canApplyCoupon,
  canRedeemLoyalty,
  isCouponOffered,
  isLoyaltyOffered,
  isPriceListOffered,
} = posDiscounts;

/** Held sales as the server saved them, with what their previews filled. */
const heldSales = {
  'SINV-1001': { party: 'Asha', loyalty_program: 'Gold', points: 40 },
  'SINV-1002': { party: 'Ravi', loyalty_program: null, points: 0 },
};

await loadFrappeModels(frappeModels, ({ path }) => {
  const name = decodeURIComponent(path).split('/').pop();
  const held = heldSales[name];
  return held ? { data: toSavedSale(name, held) } : { data: [] };
});

beforeEach(() => {
  fyo.singles.AccountingSettings = {
    enable_coupon_code: true,
    enable_loyalty_program: true,
  };
});

function toSavedSale(name, { party, loyalty_program, points }) {
  return {
    name,
    docstatus: 0,
    is_pos: 1,
    party,
    loyalty_program,
    available_loyalty_points: points,
    items: [{ name: `${name}-1`, item: 'Pen', quantity: 1 }],
  };
}

/** A sale of a Pen to Asha, whose program has 40 points left. */
function makeSale(values = {}) {
  const sale = newFrappeDoc('SalesInvoice', {
    is_pos: true,
    party: 'Asha',
    loyalty_program: 'Gold',
    available_loyalty_points: 40,
    items: [{ item: 'Pen', quantity: 1 }],
    ...values,
  });
  return sale;
}

const getGates = (sale) => [canApplyCoupon(sale), canRedeemLoyalty(sale)];

test("a reopened held sale shows its own customer's points", async () => {
  const asha = await getFrappeDoc('SalesInvoice', 'SINV-1001');
  const ravi = await getFrappeDoc('SalesInvoice', 'SINV-1002');

  assert.deepEqual(
    [asha.loyalty_program, asha.available_loyalty_points],
    ['Gold', 40]
  );
  assert.equal(canRedeemLoyalty(asha), true);
  assert.equal(canRedeemLoyalty(ravi), false);
});

const getOffers = (sale) => [isCouponOffered(sale), isLoyaltyOffered(sale)];

test('coupons and loyalty need an open sale with items and a customer', () => {
  assert.deepEqual(getGates(makeSale()), [true, true]);
  assert.deepEqual(getGates(makeSale({ items: [] })), [false, false]);
  assert.deepEqual(getGates(makeSale({ party: '' })), [false, false]);
  // The actions stay on offer, so their toasts can say what is missing.
  assert.deepEqual(getOffers(makeSale({ items: [], party: '' })), [true, true]);

  const submitted = makeSale();
  submitted.docstatus = 1;
  assert.deepEqual(getGates(submitted), [false, false]);
  assert.deepEqual(getOffers(submitted), [false, false]);
});

test('another price list is offered while the sale can change', () => {
  fyo.singles.AccountingSettings = { enable_price_list: true };
  const sale = makeSale();
  assert.equal(isPriceListOffered(sale), true);

  sale.docstatus = 1;
  assert.equal(isPriceListOffered(sale), false);
  fyo.singles.AccountingSettings = {};
  assert.equal(isPriceListOffered(makeSale()), false);
});

test('each gate follows its own feature', () => {
  fyo.singles.AccountingSettings = { enable_coupon_code: true };
  assert.deepEqual(getGates(makeSale()), [true, false]);

  fyo.singles.AccountingSettings = { enable_loyalty_program: true };
  assert.deepEqual(getGates(makeSale()), [false, true]);
});

test('loyalty also needs points to redeem on a sale, not a return', () => {
  const noPoints = makeSale({ available_loyalty_points: 0 });
  const noProgram = makeSale({ loyalty_program: null });
  const refund = makeSale({ return_against: 'SINV-0900' });

  for (const sale of [noPoints, noProgram, refund]) {
    assert.deepEqual(getGates(sale), [true, false]);
  }
});
