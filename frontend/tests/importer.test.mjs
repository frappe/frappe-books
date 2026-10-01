import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCSV } from './helpers/accounting.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  getCsvExportData,
  getExportFields,
  getExportTableFields,
  getGridRows,
  Importer,
  stubFrappe,
} from './helpers/frappe.mjs';

await loadFrappeModels(frappeModels);

test('import columns report duplicates and missing required fields', async () => {
  const importer = new Importer('Party', fyo);
  const required = [...importer.templateFieldsMap.values()].filter(
    (field) => field.required
  );
  assert.ok(required.length > 0);

  importer.assignedTemplateFields = [
    required[0].fieldKey,
    required[0].fieldKey,
    'Party.unknown',
    'Party.unknown',
  ];

  assert.deepEqual(importer.getDuplicateColumns(), [required[0].label]);
  assert.deepEqual(
    importer.getMissingRequiredColumns(),
    required.slice(1).map((field) => field.label)
  );
});

test('child table fields are never required in an import template', async () => {
  const importer = new Importer('SalesInvoice', fyo);
  const childFields = [...importer.templateFieldsMap.values()].filter(
    (field) => field.parentSchemaChildField
  );

  assert.ok(childFields.some((field) => field.fieldname === 'item'));
  assert.ok(childFields.every((field) => !field.required));
});

test('a template starts with the name that groups each document’s rows', () => {
  const fields = (schemaName) => [
    ...new Importer(schemaName, fyo).templateFieldsMap.values(),
  ];
  const [invoiceNo] = fields('SalesInvoice');
  const accountKeys = fields('Account').map(({ fieldKey }) => fieldKey);

  assert.deepEqual(
    [invoiceNo.fieldKey, invoiceNo.label, invoiceNo.required],
    ['SalesInvoice.name', 'Invoice No', true]
  );
  assert.ok(accountKeys.includes('Account.account_name'));
  assert.ok(!accountKeys.includes('Account.name'));
});

test('a party template holds a tax ID, not Indian GST fields', () => {
  const labels = [...new Importer('Party', fyo).templateFieldsMap.values()].map(
    ({ label }) => label
  );

  assert.ok(labels.includes('Tax ID'));
  assert.ok(!labels.includes('GST Registration'));
  assert.ok(!labels.includes('GSTIN No.'));
});

test('an invoice template keeps Books’ column order, without the quantity the server sets', () => {
  const importer = new Importer('SalesInvoice', fyo);
  const headers = parseCSV(importer.getCSVTemplate())[0];

  assert.deepEqual(headers.slice(0, 12), [
    'Invoice No',
    'Number Series',
    'Customer',
    'Account',
    'Date',
    'Price List',
    'Apply Discount After Tax',
    'Make Payment On Submit',
    'Make Shipment On Submit',
    'Notes',
    'Back Reference',
    'Return Against',
  ]);
  assert.ok(headers.includes('Quantity (Items)'));
  assert.ok(!headers.includes('Qty (Items)'));
});

test('each table’s columns start with its row ID, which is not imported', () => {
  const importer = new Importer('SalesInvoice', fyo);
  const headers = parseCSV(importer.getCSVTemplate())[0];
  const items = headers.filter((header) => header.endsWith('(Items)'));

  assert.deepEqual(items.slice(0, 2), ['ID (Items)', 'Item (Items)']);
  assert.ok(headers.includes('ID (Coupons)'));

  importer.assignedTemplateFields = [
    'SalesInvoice.name',
    'SalesInvoiceItem.name',
    'SalesInvoiceItem.item',
  ];
  importer.valueMatrix = [[{ value: 'A' }, { value: 'R-1' }, { value: 'Pen' }]];
  assert.deepEqual(parseCSV(importer.getImportFile().csv), [
    ['docstatus', 'items.item'],
    ['0', 'Pen'],
  ]);
});

test('a list export’s CSV maps onto the template by its keys', async () => {
  const pick = (fields, fieldnames) =>
    fields.filter(({ fieldname }) => fieldnames.includes(fieldname));
  const [items] = getExportTableFields('SalesInvoice');
  stubFrappe(() => ({
    message: [
      {
        name: 'SINV-1',
        number_series: 'SINV-',
        items: [{ item: 'Pen', quantity: 2 }],
      },
    ],
  }));
  const csv = await getCsvExportData({
    schemaName: 'SalesInvoice',
    fields: pick(getExportFields('SalesInvoice'), [
      'name',
      'number_series',
      'items',
    ]),
    tableFields: [
      { ...items, fields: pick(items.fields, ['item', 'quantity']) },
    ],
    limit: null,
    filters: [],
  });
  const importer = new Importer('SalesInvoice', fyo);

  importer.selectFile(csv);

  assert.deepEqual(importer.assignedTemplateFields.slice(0, 4), [
    'SalesInvoice.name',
    'SalesInvoice.number_series',
    'SalesInvoiceItem.item',
    'SalesInvoiceItem.quantity',
  ]);
  assert.deepEqual(
    importer.valueMatrix.map((row) => row.map(({ value }) => value)),
    [['SINV-1', 'SINV-', 'Pen', 2]]
  );
});

test('leaving a column out moves the later picked columns up', async () => {
  const importer = new Importer('Party', fyo);
  const [first, second, third] = importer.assignedTemplateFields;

  importer.pickColumn(first, false);

  assert.deepEqual(importer.assignedTemplateFields.slice(0, 2), [
    second,
    third,
  ]);
  assert.equal(importer.assignedTemplateFields.at(-1), null);
  assert.equal(importer.templateFieldsPicked.get(first), false);
});

function importRows(importer) {
  return parseCSV(importer.getImportFile().csv);
}

test('the import file puts each document’s rows together, its values on the first', async () => {
  const importer = new Importer('SalesInvoice', fyo);
  importer.assignedTemplateFields = [
    'SalesInvoice.name',
    'SalesInvoice.party',
    'SalesInvoiceItem.item',
    'SalesInvoiceItem.quantity',
  ];
  importer.valueMatrix = [
    [{ value: 'A' }, { value: 'Ann' }, { value: 'Pen' }, { value: 2 }],
    [{ value: 'B' }, { value: 'Bob' }, { value: 'Ink' }, { value: 1 }],
    [{ value: 'A' }, { value: 'Amy' }, { value: 'Pad' }, { value: 3 }],
    [{ value: null }, { value: 'Cid' }, { value: 'Pen' }, { value: 1 }],
  ];

  const file = importer.getImportFile();
  // Frappe names numbered documents, so their name only groups the rows.
  assert.deepEqual(parseCSV(file.csv), [
    ['docstatus', 'party', 'items.item', 'items.quantity'],
    ['0', 'Amy', 'Pen', '2'],
    ['', '', 'Pad', '3'],
    ['0', 'Bob', 'Ink', '1'],
  ]);
  assert.deepEqual(file.gridRows, [0, 2, 1]);
  assert.deepEqual(getGridRows(file, [2, 3]), [0, 2]);
  assert.equal(importer.getRowName(2), 'A');
});

test('named documents import their name under the DocType’s fieldname', async () => {
  const party = new Importer('Party', fyo);
  party.assignedTemplateFields = ['Party.name', 'Party.default_account'];
  party.valueMatrix = [[{ value: 'Ann' }, { value: 'Debtors' }]];
  assert.deepEqual(importRows(party), [
    ['docstatus', 'name', 'default_account'],
    ['0', 'Ann', 'Debtors'],
  ]);

  const account = new Importer('Account', fyo);
  account.assignedTemplateFields = [
    'Account.account_name',
    'Account.parent_books_account',
  ];
  account.valueMatrix = [[{ value: 'Petty Cash' }, { value: 'Cash' }]];
  assert.deepEqual(importRows(account), [
    ['docstatus', 'account_name', 'parent_books_account'],
    ['0', 'Petty Cash', 'Cash'],
  ]);
  // A doctype named by a field groups its rows by that field.
  assert.equal(account.getRowName(0), 'Petty Cash');
});

test('import cells are written as Frappe’s Data Import parses them', async () => {
  const importer = new Importer('SalesInvoice', fyo);
  importer.assignedTemplateFields = [
    'SalesInvoice.name',
    'SalesInvoice.date',
    'SalesInvoice.discount_after_tax',
    'SalesInvoiceItem.rate',
  ];
  importer.valueMatrix = [
    [
      { value: 'A' },
      { value: new Date(Date.UTC(2026, 8, 30, 4, 35)) },
      { value: true },
      { value: fyo.pesa(12.5) },
    ],
  ];

  assert.deepEqual(importRows(importer)[1], [
    '0',
    '2026-09-30 10:05:00',
    '1',
    '12.5',
  ]);
});

test('fix failed keeps the failed rows and the file columns', async () => {
  const importer = new Importer('Party', fyo);
  importer.assignedTemplateFields = ['Party.role', 'Party.name'];
  importer.valueMatrix = [
    [{ value: 'Customer' }, { value: 'A' }],
    [{ value: 'Customer' }, { value: 'B' }],
    [{ value: 'Customer' }, { value: 'C' }],
  ];

  importer.keepRows([1, 2]);

  assert.deepEqual(
    importer.valueMatrix.map((row) => row[1].value),
    ['B', 'C']
  );
  assert.deepEqual(importer.assignedTemplateFields, [
    'Party.role',
    'Party.name',
  ]);
});
