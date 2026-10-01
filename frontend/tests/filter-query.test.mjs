import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FilterSet,
  filterConditions,
  conditionsForField,
  defaultCondition,
  getFilterFields,
  getFieldLabel,
} from './helpers/accounting.mjs';

const field = (fieldtype = 'Data', fieldname = 'value') => ({
  fieldname,
  fieldtype,
  label: 'Value',
});
const types = [
  'Data',
  'Text',
  'Select',
  'Link',
  'DynamicLink',
  'Color',
  'AutoComplete',
  'Int',
  'Float',
  'Currency',
  'Date',
  'Datetime',
  'Check',
];
const values = {
  Int: '0',
  Float: '-1.25',
  Currency: '99.95',
  Date: '2024-02-29',
  Datetime: '2024-02-29T12:34:56',
  Check: false,
};
for (const type of types) {
  for (const { value: operator } of filterConditions) {
    test(`${type}: ${operator} serializes correctly or is unavailable`, () => {
      const set = new FilterSet();
      set.add('value', operator, values[type] ?? 'café');
      const offered = conditionsForField(field(type)).some(
        (c) => c.value === operator
      );
      if (!offered)
        return assert.throws(
          () => set.toFilters([field(type)]),
          /Invalid condition/
        );
      let expected = values[type] ?? 'café';
      if (['Int', 'Float', 'Currency'].includes(type))
        expected = Number(expected);
      if (type === 'Check') expected = 0;
      if (type === 'Datetime') expected = '2024-02-29 12:34:56';
      let frappeOperator = operator;
      if (['like', 'not like'].includes(operator)) expected = `%${expected}%`;
      if (operator.startsWith('is ')) {
        frappeOperator = 'is';
        expected = operator === 'is null' ? 'not set' : 'set';
      }
      assert.deepEqual(set.toFilters([field(type)]), [
        ['value', frappeOperator, expected],
      ]);
    });
  }
}
for (const [type, invalid] of [
  ['Int', ['1.1', 'word', ' ', Infinity, NaN, true]],
  ['Float', ['word', ' ', Infinity, 'NaN', true]],
  ['Currency', ['1,200', '$12', '-Infinity']],
  ['Date', ['2023-02-29', '2024-13-01', '2024', '2024-01-01T12:00']],
  ['Datetime', ['2024', '2024-01-01', '2024-01-01T25:00']],
  ['Check', ['yes', 2, -1]],
])
  for (const value of invalid)
    test(`${type} rejects ${String(value)}`, () => {
      const set = new FilterSet();
      set.add('value', '=', value);
      assert.throws(() => set.toFilters([field(type)]));
    });
for (const value of ['', null, undefined])
  test(`incomplete ${value} is skipped; empty operators still apply`, () => {
    const set = new FilterSet();
    set.add('value', '=', value);
    assert.deepEqual(set.toFilters([field()]), []);
    for (const [op, frappeValue] of [
      ['is null', 'not set'],
      ['is not null', 'set'],
    ]) {
      set.rows = [];
      set.add('value', op, value);
      assert.deepEqual(set.toFilters([field()]), [
        ['value', 'is', frappeValue],
      ]);
    }
  });
for (const value of [' ', "O'Reilly", '₹ café 中文', '%_.*[x]\\', 'a\nb'])
  test(`text preserves ${JSON.stringify(value)}`, () => {
    const set = new FilterSet();
    set.add('value', '=', value);
    assert.deepEqual(set.toFilters([field()]), [['value', '=', value]]);
  });
test('repeated fields form AND ranges; different fields are retained', () => {
  const set = new FilterSet();
  set.add('value', '>', '1');
  set.add('value', '<', '10');
  set.add('name', 'not like', 'archived');
  assert.deepEqual(set.toFilters([field('Int'), field('Data', 'name')]), [
    ['value', '>', 1],
    ['value', '<', 10],
    ['name', 'not like', '%archived%'],
  ]);
});
test('clear preserves hidden filters and stable IDs remove the visible row', () => {
  const set = new FilterSet();
  set.add('value', '=', 'base', true);
  set.add('value', '=', 'visible');
  set.remove(set.rows[1].id);
  assert.equal(set.rows[0].value, 'base');
  set.add('value', '=', 'new');
  set.clear();
  assert.deepEqual(set.toFilters([field()]), [['value', '=', 'base']]);
});
test('normalization deduplicates and preserves only the last incomplete draft', () => {
  const set = new FilterSet();
  for (const value of ['', 'same', 'same', '']) set.add('value', '=', value);
  set.normalize();
  assert.deepEqual(
    set.rows.map((r) => r.value),
    ['same', '']
  );
});
test('unknown fields fail and number series keeps its own query field', () => {
  const set = new FilterSet();
  set.add('numberSeries', 'like', 'INV-');
  assert.throws(() => set.toFilters([field()]));
  assert.deepEqual(set.toFilters([field('Link', 'numberSeries')]), [
    ['numberSeries', 'like', '%INV-%'],
  ]);
  assert.equal(defaultCondition(field('Int')), '=');
  for (const type of ['Select', 'Link', 'DynamicLink', 'Check'])
    assert.equal(defaultCondition(field(type)), '=');
  assert.equal(defaultCondition(field('Text')), 'like');
});
test('field selection excludes unsupported and computed fields; column position is irrelevant', () => {
  const fields = [
    field('Data', 'editable'),
    ...['Table', 'Button', 'Attachment', 'AttachImage', 'Secret'].map(
      (type) => ({ ...field(type, type), filter: true })
    ),
    { ...field('Data', 'readonly'), readOnly: true },
    { ...field('Currency', 'total'), computed: true, filter: true },
    { ...field('Data', 'hidden'), filter: false },
  ];
  const columns = [
    { ...field('Data', 'unrelated') },
    'name',
    { ...field('Data', 'status') },
  ];
  assert.deepEqual(
    getFilterFields(fields, columns).map((f) => f.fieldname),
    ['editable', 'total']
  );
  assert.equal(fields.length, 9);
  const status = { ...field('Select', 'status'), options: ['Open', 'Closed'] };
  assert.equal(
    getFilterFields([status], columns).filter((f) => f.fieldname === 'status')
      .length,
    1
  );
  assert.equal(getFilterFields([status], columns)[0], status);
  assert.deepEqual(
    getFilterFields([], ['name', { ...field('Data', 'unrelated') }]),
    []
  );
});
test('filter labels retain supplied translations and format identifiers and acronyms', () => {
  assert.equal(getFieldLabel({ ...field(), label: 'Montant' }), 'Montant');
  for (const [name, expected] of [
    ['gstin', 'GSTIN'],
    ['defaultAccount', 'Default Account'],
    ['created_by', 'Created by'],
  ]) {
    assert.equal(
      getFieldLabel({ ...field('Data', name), label: name }),
      expected
    );
  }
});
