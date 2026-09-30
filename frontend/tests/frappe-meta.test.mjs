import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateCondition,
  fyo,
  getModel,
  getSchema,
  getSearchFields,
  isFrappeBacked,
  loadTestDocTypes,
  toSchema,
} from './helpers/frappe.mjs';

const { TestItem } = await loadTestDocTypes();
const schema = getSchema('Item');
const field = (fieldname) =>
  schema.fields.find((field) => field.fieldname === fieldname);

test('a registered schema and its tables are Frappe-backed, the rest use the bridge', () => {
  assert.ok(isFrappeBacked('Item'));
  assert.ok(isFrappeBacked('UOMConversionItem'));
  assert.ok(!isFrappeBacked('Account'));
  assert.equal(getModel('Item'), TestItem);
  fyo.doc.models.Account = class Account {};
  assert.equal(getModel('Account'), fyo.doc.models.Account);
});

test('breaks become Books sections and tabs; column breaks are dropped', () => {
  assert.deepEqual(
    schema.fields
      .filter((field) => !field.meta)
      .map(({ fieldname, section, tab }) => [fieldname, section, tab]),
    [
      ['image', 'Details', undefined],
      ['name', 'Details', undefined],
      ['item_type', 'Details', undefined],
      ['rate', 'Details', undefined],
      ['income_account', 'Details', undefined],
      ['unit', 'Details', undefined],
      ['track_item', 'Default', 'Inventory'],
      ['batch_series', 'Default', 'Inventory'],
      ['secret_code', 'Default', 'Inventory'],
      ['hidden_code', 'Default', 'Inventory'],
      ['released_on', 'Default', 'Inventory'],
      ['uom_conversions', 'Default', 'Inventory'],
      // Placed as the Books Custom Form's rows say, in their order.
      ['custom_books_shelf', 'Storage', 'Custom'],
      ['custom_books_colour', 'Extra', undefined],
    ]
  );
});

test('a prompt-named doctype asks for the name after its image', () => {
  assert.deepEqual(
    [field('name').label, field('name').placeholder, field('name').required],
    ['Item Name', 'Item Name', true]
  );
  assert.equal(schema.naming, 'manual');
  assert.equal(schema.label, 'Item');
});

test('DocField properties become Books field properties', () => {
  assert.equal(field('image').fieldtype, 'AttachImage');
  assert.deepEqual(field('item_type').options, [
    { label: 'Product', value: 'Product' },
    { label: 'Service', value: 'Service' },
  ]);
  assert.equal(field('item_type').setOnlyOnce, true);
  assert.equal(field('rate').minvalue, 0);
  assert.equal(field('income_account').placeholder, 'Income');
  assert.equal(field('income_account').required, true);
  // Links and tables target Books schema names; `only_select` hides Create.
  assert.equal(field('income_account').target, 'Account');
  assert.equal(field('income_account').create, true);
  assert.equal(field('unit').create, false);
  assert.equal(field('uom_conversions').target, 'UOMConversionItem');
  // Rules that depend on values are left to the doc.
  assert.equal(field('track_item').hidden, undefined);
  assert.equal(field('batch_series').readOnly, undefined);
  assert.equal(field('batch_series').required, undefined);
});

test('permission levels the user cannot write are read only, unreadable ones hidden', () => {
  assert.equal(field('secret_code').readOnly, true);
  assert.equal(field('secret_code').hidden, undefined);
  assert.equal(field('hidden_code').hidden, true);
});

test('standard columns are meta fields and a table lists its in_list_view fields', () => {
  assert.deepEqual(
    schema.fields.filter((field) => field.meta).map((field) => field.fieldname),
    ['owner', 'modified_by', 'creation', 'modified']
  );
  assert.deepEqual(getSchema('UOMConversionItem').tableFields, [
    'uom',
    'conversion_factor',
  ]);
  assert.equal(getSchema('UOMConversionItem').isChild, true);
});

test('search fields come from the DocType', () => {
  assert.deepEqual(getSearchFields('Item'), ['item_type', 'item_usage']);
});

test('conditions are evaluated as Frappe forms evaluate them', () => {
  const product = { item_type: 'Product', track_item: 0, __islocal: 1 };
  const condition =
    "eval:doc.item_type == 'Product' && (doc.__islocal || doc.track_item)";
  assert.equal(evaluateCondition(condition, product), true);
  assert.equal(
    evaluateCondition(condition, { ...product, __islocal: 0 }),
    false
  );
  assert.equal(evaluateCondition('track_item', { track_item: 1 }), true);
  assert.equal(evaluateCondition('rows', { rows: [] }), false);
  assert.equal(
    evaluateCondition('eval:parent.is_return', {}, { is_return: 1 }),
    true
  );
  assert.equal(evaluateCondition(undefined, {}), true);
});

test('a model presents option labels, row editing, state colours and help text', () => {
  const meta = {
    name: 'Books Rule',
    autoname: 'hash',
    permissions: [],
    states: [{ title: 'Active', color: 'Green' }],
    fields: [
      { fieldname: 'status', fieldtype: 'Select', options: 'Active\nDone' },
      { fieldname: 'kind', fieldtype: 'Select', options: 'rate\namount' },
      { fieldname: 'rows', fieldtype: 'Table', options: 'Books Row' },
      { fieldname: 'factor', fieldtype: 'Float', description: '1 or less' },
    ],
  };
  const presentation = {
    label: 'Rule',
    linkDisplayField: 'kind',
    fields: {
      kind: { optionLabels: { rate: 'Rate' } },
      rows: { edit: true },
    },
  };
  const context = { schemaNames: {}, roles: [], placements: {} };
  const rule = toSchema(meta, 'Rule', presentation, context);
  const byName = Object.fromEntries(rule.fields.map((f) => [f.fieldname, f]));

  assert.equal(rule.linkDisplayField, 'kind');
  assert.deepEqual(byName.kind.options, [
    { value: 'rate', label: 'Rate' },
    { value: 'amount', label: 'amount' },
  ]);
  assert.equal(byName.rows.edit, true);
  assert.deepEqual(byName.status.states, { Active: 'Green' });
  assert.equal(byName.factor.sub_label, '1 or less');
});

test('a doctype named by script from its number series names by number series', () => {
  const context = { schemaNames: {}, roles: [], placements: {} };
  const meta = (fields) => ({ name: 'Books Rule', permissions: [], fields });
  const series = [{ fieldname: 'number_series', fieldtype: 'Link' }];
  assert.equal(
    toSchema(meta(series), 'Rule', { label: 'Rule' }, context).naming,
    'numberSeries'
  );
  assert.equal(
    toSchema(meta([]), 'Rule', { label: 'Rule' }, context).naming,
    'random'
  );
});
