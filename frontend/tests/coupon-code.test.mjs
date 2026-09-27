import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a coupon code leaves its amount and date rules to the server', async () => {
  const fyo = await makeFyo();
  fyo.db.getAll = async () => [
    {
      minAmount: fyo.pesa(10),
      maxAmount: fyo.pesa(100),
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
    },
  ];
  const coupon = fyo.doc.getNewDoc('CouponCode', {
    pricingRule: 'Promotion',
    validFrom: new Date('2026-06-01'),
    minAmount: fyo.pesa(20),
  });

  await coupon.set('validTo', new Date('2026-06-01'));
  await coupon.set('maxAmount', fyo.pesa(5));

  assert.equal(coupon.validTo.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(coupon.maxAmount.float, 5);
});
