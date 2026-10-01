import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FilterSet,
  filterConditions,
  conditionsForField,
  defaultCondition,
  mergeQueryFilters,
  makeFyo,
  getFilterFields,
  getFieldLabel,
  getJsonExportData,
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
          () => set.toQuery([field(type)]),
          /Invalid condition/
        );
      let expected = values[type] ?? 'café';
      if (['Int', 'Float', 'Currency'].includes(type))
        expected = Number(expected);
      if (type === 'Check') expected = 0;
      if (type === 'Datetime') expected = '2024-02-29 12:34:56';
      if (['like', 'not like'].includes(operator)) expected = `%${expected}%`;
      if (operator.startsWith('is ')) expected = null;
      assert.deepEqual(set.toQuery([field(type)]), {
        value: [operator, expected],
      });
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
      assert.throws(() => set.toQuery([field(type)]));
    });
for (const value of ['', null, undefined])
  test(`incomplete ${value} is skipped; empty operators still apply`, () => {
    const set = new FilterSet();
    set.add('value', '=', value);
    assert.deepEqual(set.toQuery([field()]), {});
    for (const op of ['is null', 'is not null']) {
      set.rows = [];
      set.add('value', op, value);
      assert.deepEqual(set.toQuery([field()]), { value: [op, null] });
    }
  });
for (const value of [' ', "O'Reilly", '₹ café 中文', '%_.*[x]\\', 'a\nb'])
  test(`text preserves ${JSON.stringify(value)}`, () => {
    const set = new FilterSet();
    set.add('value', '=', value);
    assert.deepEqual(set.toQuery([field()]), { value: ['=', value] });
  });
test('repeated fields form AND ranges; different fields are retained', () => {
  const set = new FilterSet();
  set.add('value', '>', '1');
  set.add('value', '<', '10');
  set.add('name', 'not like', 'archived');
  assert.deepEqual(set.toQuery([field('Int'), field('Data', 'name')]), {
    value: ['>', 1, '<', 10],
    name: ['not like', '%archived%'],
  });
});
test('clear preserves hidden filters and stable IDs remove the visible row', () => {
  const set = new FilterSet();
  set.add('value', '=', 'base', true);
  set.add('value', '=', 'visible');
  set.remove(set.rows[1].id);
  assert.equal(set.rows[0].value, 'base');
  set.add('value', '=', 'new');
  set.clear();
  assert.deepEqual(set.toQuery([field()]), { value: ['=', 'base'] });
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
test('round trip keeps repeated conditions, zero, false, empty and SQL datetimes', () => {
  const query = {
    text: ['like', '%a%', 'not like', '%b%', 'is not null', null],
    num: ['=', 0],
    check: false,
    date: ['=', '2024-01-01 00:00:00'],
  };
  const set = new FilterSet();
  set.setQuery(query);
  assert.deepEqual(
    set.toQuery([
      field('Text', 'text'),
      field('Int', 'num'),
      field('Check', 'check'),
      field('Datetime', 'date'),
    ]),
    { ...query, check: ['=', 0] }
  );
});
for (const value of [[], ['='], ['bad', 'x'], ['=', {}], ['=', []]])
  test(`malformed query ${JSON.stringify(value)} is atomic`, () => {
    const set = new FilterSet();
    set.add('value', '=', 'original');
    assert.throws(() => set.setQuery({ first: 'valid', value }));
    assert.equal(set.rows[0].value, 'original');
  });
test('unknown fields fail and number series keeps its own query field', () => {
  const set = new FilterSet();
  set.add('numberSeries', 'like', 'INV-');
  assert.throws(() => set.toQuery([field()]));
  assert.deepEqual(set.toQuery([field('Link', 'numberSeries')]), {
    numberSeries: ['like', '%INV-%'],
  });
  assert.equal(defaultCondition(field('Int')), '=');
  for (const type of ['Select', 'Link', 'DynamicLink', 'Check'])
    assert.equal(defaultCondition(field(type)), '=');
  assert.equal(defaultCondition(field('Text')), 'like');
});
test('merging user filters cannot replace base restrictions or mutate inputs', () => {
  const base = { name: ['in', ['one', 'two']], value: 'base' };
  const user = { name: ['like', '%one%'], value: ['!=', 'other'] };
  assert.deepEqual(mergeQueryFilters(base, user), {
    name: ['in', ['one', 'two'], 'like', '%one%'],
    value: ['=', 'base', '!=', 'other'],
  });
  assert.deepEqual(base, { name: ['in', ['one', 'two']], value: 'base' });
});
test('filtered export sends status to the server and pages rows', async () => {
  const fyo = await makeFyo();
  const calls = [];
  const names = Array.from({ length: 700 }, (_, i) => ({ name: `JV-${i}` }));
  fyo.db.getAllRaw = async (_schema, options) => {
    calls.push(options);
    return names.slice(options.offset, options.offset + options.limit);
  };
  const query = { name: ['like', 'JV%'], status: ['=', 'Submitted'] };
  const fields = [{ fieldname: 'name', fieldtype: 'Data', export: true }];
  const limited = await getJsonExportData(
    'JournalEntry',
    fields,
    [],
    1,
    query,
    fyo
  );
  assert.deepEqual(JSON.parse(limited), [{ name: 'JV-0' }]);
  assert.deepEqual(calls[0].filters, query);
  assert.equal(calls[0].limit, 1);
  calls.length = 0;
  const all = await getJsonExportData(
    'JournalEntry',
    fields,
    [],
    null,
    query,
    fyo
  );
  assert.equal(JSON.parse(all).length, 700);
  assert.deepEqual(
    calls.map(({ offset, limit }) => [offset, limit]),
    [
      [0, 500],
      [500, 500],
    ]
  );
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
