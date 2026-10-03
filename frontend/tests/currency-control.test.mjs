import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Currency, fyo } from './helpers/ui.mjs';

/** A Currency control's script, without its template. */
function getControl(value) {
  const control = {
    value,
    df: { fieldtype: 'Currency', fieldname: 'rate', label: 'Rate' },
    doc: undefined,
    fyo,
    ...Currency.data?.call({}),
  };
  for (const [name, method] of Object.entries(Currency.methods)) {
    control[name] = method.bind(control);
  }
  for (const [name, getter] of Object.entries(Currency.computed ?? {})) {
    Object.defineProperty(control, name, { get: () => getter.call(control) });
  }
  return control;
}

test('a currency field shows the formatted amount, and the bare number while focused', () => {
  fyo.singles.SystemSettings = { currency: 'INR', display_precision: 2 };
  fyo.currencySymbols = { INR: '₹' };
  const control = getControl(fyo.pesa(6500));

  assert.equal(control.displayValue, '₹ 6,500.00');

  control.isFocused = true;
  assert.equal(control.displayValue, '6500.00');
});
