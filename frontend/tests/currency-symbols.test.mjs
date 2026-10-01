import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo } from './helpers/fyo.mjs';

test("amounts carry the symbols of the currencies in Frappe's boot", () => {
  const fyo = new Fyo();
  const field = { fieldname: 'amount', fieldtype: 'Currency' };

  assert.doesNotMatch(fyo.format(fyo.pesa(5), field), /₹/);
  fyo.setCurrencySymbols([
    { doctype: ':Currency', name: 'INR', symbol: '₹' },
    { doctype: ':Currency', name: 'XYZ', symbol: null },
    { doctype: 'Page', name: 'INR' },
  ]);
  assert.deepEqual(fyo.currencySymbols, { INR: '₹', XYZ: undefined });
  assert.match(fyo.format(fyo.pesa(5), field), /^₹ 5\.00$/);
});
