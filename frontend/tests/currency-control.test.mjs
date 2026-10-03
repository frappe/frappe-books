import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Currency, fyo, parseNumber } from './helpers/ui.mjs';

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

/** Books formats numbers by its locale, as Frappe's desk does by its number format. */
function setLocale(locale) {
  fyo.singles.SystemSettings = {
    currency: 'INR',
    display_precision: 2,
    locale,
  };
  fyo.currencySymbols = { INR: '₹' };
  fyo.currencyFormatter = undefined;
}

test('a currency field shows the number as Frappe desk formats it for input, and the bare number while focused', () => {
  setLocale('en-IN');
  const control = getControl(fyo.pesa(650000));

  // Desk's format_for_input: the number format, without the currency symbol.
  assert.equal(control.displayValue, '6,50,000.00');
  assert.equal(getControl(null).displayValue, '');

  control.isFocused = true;
  assert.equal(control.displayValue, '650000.00');
});

test('a typed amount is read as Frappe desk reads it, and text that is no number clears the field', () => {
  setLocale('en-IN');
  const control = getControl(null);

  assert.equal(control.parse('6,500.00').float, 6500);
  assert.equal(control.parse('100*2+5').float, 205);
  assert.equal(control.parse('abc'), null);
  assert.equal(control.parse(''), null);
});

test('numbers are read by the number format, with simple arithmetic evaluated', () => {
  setLocale('en-IN');
  for (const [text, number] of [
    ['6,500.00', 6500],
    ['1,00,000', 100000],
    ['100*2+5', 205],
    ['(10+5)/3', 5],
    ['-5', -5],
    ['12abc', 12],
    ['abc', null],
    ['₹ 6,500.00', null],
    ['', null],
    ['1/0', null],
  ]) {
    assert.equal(parseNumber(text, fyo), number, text);
  }

  setLocale('de-DE');
  assert.equal(parseNumber('6.500,50', fyo), 6500.5);
  assert.equal(parseNumber('2,5*2', fyo), 5);
});
