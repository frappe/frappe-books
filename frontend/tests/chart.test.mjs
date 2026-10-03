import assert from 'node:assert/strict';
import test from 'node:test';
import { getAxisLabels, getCompactCurrencyFormat } from '../src/utils/chart.ts';

test('chart value ticks are compact on every screen; phones shorten months', () => {
  for (const isPhone of [false, true]) {
    const { x, y } = getAxisLabels('en-IN', isPhone);
    assert.equal(y.axisLabel.formatter(2500000), '25L');
    assert.equal(x?.axisLabel.formatter('2026-10'), isPhone ? 'Oct' : undefined);
  }
});

test('phone tiles show amounts compact, behind the currency symbol', () => {
  assert.equal(getCompactCurrencyFormat('en-IN', '₹')(123456.78), '₹ 1.2L');
  assert.equal(getCompactCurrencyFormat('en-US', '$')(950), '$ 950');
  assert.equal(getCompactCurrencyFormat('en-US')(12345678), '12.3M');
});
