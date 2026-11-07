import assert from 'node:assert/strict';
import test from 'node:test';
import { isFeatureOn } from '../fyo/utils/features.ts';

test('a switch is off while the switch it needs is off', () => {
  const on = (settings, feature) =>
    isFeatureOn({ AccountingSettings: settings }, feature);
  const all = {
    enable_discounts_and_margin: true,
    enable_pricing_rule: true,
    enable_coupon_code: true,
  };

  assert.equal(on(all, 'enable_coupon_code'), true);
  assert.equal(
    on({ ...all, enable_pricing_rule: false }, 'enable_coupon_code'),
    false
  );
  assert.equal(
    on({ ...all, enable_discounts_and_margin: false }, 'enable_coupon_code'),
    false
  );
});
