import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AutoComplete, Color, Select } from './helpers/ui.mjs';

/** A control's script, without its template or its Base parent. */
function getControl(Component, values) {
  const control = { ...values };
  for (const [name, method] of Object.entries(Component.methods ?? {})) {
    control[name] = method.bind(control);
  }
  for (const [name, getter] of Object.entries(Component.computed ?? {})) {
    Object.defineProperty(control, name, { get: () => getter.call(control) });
  }
  return control;
}

test('a Select that may be left empty offers no value first, unless one is required', () => {
  const df = {
    fieldtype: 'Select',
    allowEmpty: true,
    options: [{ label: 'CGST', value: 'CGST' }],
  };

  const optional = getControl(Select, { df, isRequired: false });
  assert.deepEqual(
    optional.options.map(({ value }) => value),
    ['', 'CGST']
  );
  const required = getControl(Select, { df, isRequired: true });
  assert.deepEqual(
    required.options.map(({ value }) => value),
    ['CGST']
  );
});

test('an AutoComplete keeps only a listed value, as Frappe desk does, unless it takes its own', () => {
  const df = {
    fieldtype: 'AutoComplete',
    options: [
      { label: 'Maharashtra', value: 'Maharashtra' },
      { label: '23/03/2022', value: 'dd/MM/yyyy' },
    ],
  };
  const changes = [];
  const getChange = (value, field = df) => {
    const control = getControl(AutoComplete, {
      df: field,
      value,
      triggerChange: (change) => changes.push(change),
    });
    control.clearUnlistedValue();
    return changes.splice(0);
  };

  assert.deepEqual(getChange('Maharashta'), ['']);
  assert.deepEqual(getChange('23/03/2022'), ['dd/MM/yyyy']);
  assert.deepEqual(getChange('Maharashtra'), []);
  assert.deepEqual(getChange('Goa', { ...df, allowCustom: true }), []);
  assert.deepEqual(getChange('Goa', { ...df, options: [] }), []);
});

test('a Color takes a hex value, and an emptied one clears it, as Frappe desk does', () => {
  const changes = [];
  const color = getControl(Color, {
    triggerChange: (change) => changes.push(change),
  });

  color.setColorValue('ff0000');
  color.setColorValue('#12');
  color.setColorValue('');
  assert.deepEqual(changes, ['#ff0000', null]);
});
