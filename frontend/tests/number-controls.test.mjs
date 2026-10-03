import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Currency,
  ExchangeRate,
  Float,
  fyo,
  Int,
  parseNumber,
} from './helpers/ui.mjs';

/** A control's script, its parents' included, without its template. */
function getControl(Component, value, fieldtype = 'Currency') {
  const control = {
    value,
    df: { fieldtype, fieldname: 'rate', label: 'Rate' },
    doc: undefined,
    fyo,
    $emit() {},
  };
  const chain = [];
  for (let part = Component; part; part = part.extends) chain.unshift(part);
  for (const part of chain) {
    for (const [name, method] of Object.entries(part.methods ?? {})) {
      control[name] = method.bind(control);
    }
    for (const [name, getter] of Object.entries(part.computed ?? {})) {
      Object.defineProperty(control, name, {
        get: () => getter.call(control),
        configurable: true,
      });
    }
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

/** An input element as the control's focus and blur handlers see it. */
function getInput(value) {
  globalThis.HTMLInputElement ??= class {};
  return Object.assign(new HTMLInputElement(), {
    value,
    select() {
      this.isSelected = true;
    },
  });
}

test('a currency field shows the number as Frappe desk formats it for input, also while focused', () => {
  setLocale('en-IN');
  const control = getControl(Currency, fyo.pesa(650000));

  // Desk's format_for_input: the number format, without the currency symbol.
  assert.equal(control.inputValue, '6,50,000.00');
  assert.equal(getControl(Currency, null).inputValue, '');

  // Desk keeps the formatted amount on focus and selects it.
  const input = getInput(control.inputValue);
  control.onFocus({ target: input });
  assert.equal(input.isSelected, true);
  assert.equal(control.inputValue, '6,50,000.00');
});

test('a blurred currency field shows its amount formatted again, as Desk does', () => {
  setLocale('en-IN');
  const control = getControl(Currency, fyo.pesa(6500));
  const changes = [];
  control.triggerChange = (value) => changes.push(value);

  const input = getInput('6500');
  control.onBlur({ target: input });
  assert.deepEqual(changes, ['6500']);
  assert.equal(input.value, '6,500.00');
});

test('a typed amount is read as Frappe desk reads it, and text that is no number clears the field', () => {
  setLocale('en-IN');
  const control = getControl(Currency, null);

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

test('an amount left as it was is not changed on blur, as Desk changes only edited values', () => {
  setLocale('en-IN');
  const control = getControl(Currency, fyo.pesa(8.333333));
  const changes = [];
  control.triggerChange = (value) => changes.push(value);

  control.onBlur({ target: getInput(control.inputValue) });
  assert.deepEqual(changes, []);
});

test('Int fields read typed numbers as Desk does', () => {
  setLocale('en-IN');
  const control = getControl(Int, 1000, 'Int');

  assert.equal(control.inputType, 'text');
  assert.equal(control.inputMode, 'numeric');
  assert.equal(control.parse('1,000'), 1000);
  assert.equal(control.parse('100*2+5'), 205);
  assert.equal(control.parse('12.7'), 12);
  assert.equal(control.parse('abc'), null);
  assert.equal(control.parse(''), null);
});

test('Float fields read typed numbers as Desk does, and show them in the number format', () => {
  setLocale('en-IN');
  const control = getControl(Float, 123456.5, 'Float');

  assert.equal(control.inputType, 'text');
  assert.equal(control.inputMode, 'decimal');
  assert.equal(control.inputValue, '1,23,456.50');
  assert.equal(getControl(Float, null, 'Float').inputValue, '');
  assert.equal(control.parse('1,234.5'), 1234.5);
  assert.equal(control.parse('2*1.5'), 3);
  assert.equal(control.parse('0.0833'), 0.0833);
  assert.equal(control.parse('abc'), null);

  const input = getInput(control.inputValue);
  control.onFocus({ target: input });
  assert.equal(input.isSelected, true);
});

test('the exchange rate widget reads typed rates as Desk reads numbers', () => {
  setLocale('en-IN');
  const widget = getControl(ExchangeRate, undefined);
  Object.assign(widget, { ...ExchangeRate.data(), exchangeRate: 80 });
  const emitted = [];
  widget.$emit = (event, value) => emitted.push(value);

  widget.rightChange({ target: getInput('1,000') });
  widget.setFromValue('2*5');
  assert.equal(widget.fromValue, 10);
  widget.rightChange({ target: getInput('abc') });

  assert.deepEqual(emitted, [1000]);
});
