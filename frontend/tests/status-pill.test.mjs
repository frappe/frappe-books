import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fyo, StatusPill } from './helpers/ui.mjs';

/** The status pill of a submitted invoice, as its component computes it. */
function getBadge(values) {
  const pill = {
    doc: { schema: { isSubmittable: true, fields: [] }, ...values },
    fyo,
    t: (strings, ...parts) => String.raw({ raw: strings }, ...parts),
  };
  for (const [name, method] of Object.entries(StatusPill.methods)) {
    pill[name] = method.bind(pill);
  }
  return StatusPill.computed.badge.call(pill);
}

test('a partly paid foreign-currency invoice shows the paid amount in the company currency', () => {
  fyo.singles.SystemSettings = { currency: 'INR', display_precision: 2 };
  fyo.currencySymbols = { INR: '₹', USD: '$' };

  const badge = getBadge({
    status: 'Partly Paid',
    grand_total: fyo.pesa(100),
    base_grand_total: fyo.pesa(8000),
    outstanding_amount: fyo.pesa(3000),
  });

  assert.equal(badge.label, 'Partly Paid ₹ 5,000.00');
});
