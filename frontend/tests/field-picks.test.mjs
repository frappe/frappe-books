import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  canPickFields,
  getKeptPicks,
  getPickerFields,
  getPickerTables,
  getSavedPicks,
} from './helpers/frappe.mjs';

const bootWindow = globalThis.window;

afterEach(() => {
  globalThis.window = bootWindow;
});

/** An ERPNext doctype as the registry lays it out: `moreDetails` marks fields with no Books position. */
function docType(doctype, metaFields, schema, tables = {}) {
  return {
    doctype,
    meta: { name: doctype, fields: metaFields },
    schema,
    tables,
  };
}

const items = docType(
  'Sales Invoice Item',
  [
    { fieldname: 'item_code', fieldtype: 'Link', label: 'Item' },
    { fieldname: 'net_rate', fieldtype: 'Currency', label: 'Net Rate' },
    { fieldname: 'warehouse', fieldtype: 'Link', label: 'Warehouse' },
  ],
  {
    quickEditFields: ['item_code'],
    fields: [
      { fieldname: 'item_code' },
      { fieldname: 'net_rate' },
      { fieldname: 'warehouse', moreDetails: 'picked' },
    ],
  }
);

const salesTeam = docType(
  'Sales Team',
  [
    { fieldname: 'sales_person', fieldtype: 'Link', label: 'Sales Person' },
    { fieldname: 'incentives', fieldtype: 'Currency', label: 'Incentives' },
  ],
  {
    tableFields: ['sales_person'],
    fields: [
      { fieldname: 'sales_person' },
      { fieldname: 'incentives', moreDetails: 'picked' },
    ],
  }
);

const invoice = docType(
  'Sales Invoice',
  [
    { fieldname: 'customer', fieldtype: 'Link', label: 'Customer', reqd: 1 },
    { fieldname: 'po_no', fieldtype: 'Data', label: "Customer's PO" },
    { fieldname: 'more_info', fieldtype: 'Tab Break', label: 'More Info' },
    { fieldname: 'remarks', fieldtype: 'Small Text', label: 'Remarks' },
    { fieldname: 'secret', fieldtype: 'Data', label: 'Secret' },
    {
      fieldname: 'commission',
      fieldtype: 'Section Break',
      label: 'Commission',
    },
    {
      fieldname: 'sales_team',
      fieldtype: 'Table',
      label: 'Sales Team',
      options: 'Sales Team',
    },
    {
      fieldname: 'items',
      fieldtype: 'Table',
      label: 'Items',
      options: 'Sales Invoice Item',
    },
    { fieldname: 'return_against', fieldtype: 'Link', label: 'Return Against' },
  ],
  {
    fields: [
      { fieldname: 'customer' },
      { fieldname: 'po_no', moreDetails: 'picked' },
      { fieldname: 'remarks', moreDetails: 'ifMissing' },
      { fieldname: 'secret', moreDetails: 'ifMissing', hidden: true },
      { fieldname: 'sales_team', moreDetails: 'ifMissing' },
      { fieldname: 'items' },
      { fieldname: 'return_against' },
    ],
  },
  { items, sales_team: salesTeam }
);

test('the picker lists the shown fields in ERPNext order, with their section and why they are always on', () => {
  const listed = getPickerFields(invoice).map(({ key, section, lock }) => [
    key,
    section,
    lock,
  ]);

  assert.deepEqual(listed, [
    [':customer', 'Details', 'mandatory'],
    [':po_no', 'Details', undefined],
    [':remarks', 'More Info', undefined],
    [':sales_team', 'Commission', undefined],
    [':items', 'Commission', 'onForm'],
    [':return_against', 'Commission', 'onForm'],
  ]);
});

test("row fields on the form are the row editor's; other positioned ones are not listed", () => {
  const listed = getPickerFields(invoice, 'items').map(({ key, lock }) => [
    key,
    lock,
  ]);

  assert.deepEqual(listed, [
    ['items:item_code', 'onForm'],
    ['items:warehouse', undefined],
  ]);
});

test("rows can be picked for Books' own tables and picked ones", () => {
  const tables = (picks) =>
    getPickerTables(invoice, new Set(picks)).map(({ fieldname }) => fieldname);

  assert.deepEqual(tables([]), ['items']);
  assert.deepEqual(tables([':sales_team']), ['sales_team', 'items']);
});

test('a save keeps free picks of the document and of the tables it offers', () => {
  const picks = new Set([
    ':po_no',
    ':customer',
    ':sales_team',
    'sales_team:incentives',
    'items:warehouse',
    'items:item_code',
  ]);

  assert.deepEqual(
    getKeptPicks(invoice, picks).map(({ key }) => key),
    [':po_no', ':sales_team', 'sales_team:incentives', 'items:warehouse']
  );
  // A table's row picks go with the table.
  assert.deepEqual([...getSavedPicks(invoice)], [':po_no', 'items:warehouse']);
});

test('only who can write field picks picks fields, and only in accessory mode', () => {
  const boot = (accessory, canWrite) => {
    globalThis.window = {
      frappe: {
        boot: {
          books: { accessory_mode: accessory },
          user: { can_write: canWrite ? ['Books Field Pick'] : [] },
        },
      },
    };
  };

  boot(true, true);
  assert.equal(canPickFields(), true);
  boot(true, false);
  assert.equal(canPickFields(), false);
  boot(false, true);
  assert.equal(canPickFields(), false);
});
