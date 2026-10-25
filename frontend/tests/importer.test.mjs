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
  const importer = new Importer('Customer', fyo);
  const required = [...importer.templateFieldsMap.values()].filter(
    (field) => field.required
  );
  assert.ok(required.length > 0);

  importer.assignedTemplateFields = [
    required[0].fieldKey,
    required[0].fieldKey,
    'Customer.unknown',
    'Customer.unknown',
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

  assert.ok(childFields.some((field) => field.fieldname === 'item_code'));
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

test('a customer template holds a tax ID, not Indian GST fields', () => {
  const labels = [
    ...new Importer('Customer', fyo).templateFieldsMap.values(),
  ].map(({ label }) => label);

  assert.ok(labels.includes('Tax ID'));
  assert.ok(!labels.includes('GST Category'));
  assert.ok(!labels.includes('GSTIN / UIN'));
});

test('an invoice template keeps Books’ column order, without the stock quantity the server sets', () => {
  const importer = new Importer('SalesInvoice', fyo);
  const headers = parseCSV(importer.getCSVTemplate())[0];

  assert.deepEqual(headers.slice(0, 12), [
    'Invoice No',
    'Number Series',
    'Customer',
    'Debit To',
    'Date',
    'Price List',
    'Sales Taxes and Charges Template',
    'Apply Discount After Tax',
    'Make Payment On Submit',
    'Make Delivery Note On Submit',
    'Notes',
    'Return Against',
  ]);
  assert.ok(headers.includes('Quantity (Items)'));
  assert.ok(!headers.includes('Qty as per Stock UOM (Items)'));
});

test('each table’s columns start with its row ID, which is not imported', () => {
  const importer = new Importer('SalesInvoice', fyo);
  const headers = parseCSV(importer.getCSVTemplate())[0];
  const items = headers.filter((header) => header.endsWith('(Items)'));

  assert.deepEqual(items.slice(0, 2), ['ID (Items)', 'Item (Items)']);
  assert.ok(headers.includes('ID (Sales Taxes and Charges)'));

  importer.assignedTemplateFields = [
    'SalesInvoice.name',
    'SalesInvoiceItem.name',
    'SalesInvoiceItem.item_code',
  ];
  importer.valueMatrix = [[{ value: 'A' }, { value: 'R-1' }, { value: 'Pen' }]];
  assert.deepEqual(parseCSV(importer.getImportFile().csv), [
    ['docstatus', 'items.item_code'],
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
        naming_series: 'SINV-',
        items: [{ item_code: 'Pen', qty: 2 }],
      },
    ],
  }));
  const csv = await getCsvExportData({
    schemaName: 'SalesInvoice',
    fields: pick(getExportFields('SalesInvoice'), [
      'name',
      'naming_series',
      'items',
    ]),
    tableFields: [
      { ...items, fields: pick(items.fields, ['item_code', 'qty']) },
    ],
    limit: null,
    filters: [],
  });
  const importer = new Importer('SalesInvoice', fyo);

  importer.selectFile(csv);

  assert.deepEqual(importer.assignedTemplateFields.slice(0, 4), [
    'SalesInvoice.name',
    'SalesInvoice.naming_series',
    'SalesInvoiceItem.item_code',
    'SalesInvoiceItem.qty',
  ]);
  assert.deepEqual(
    importer.valueMatrix.map((row) => row.map(({ value }) => value)),
    [['SINV-1', 'SINV-', 'Pen', 2]]
  );
});

test('a file with fewer columns than the template has only its own columns', () => {
  const importer = new Importer('Customer', fyo);
  const [first, , third] = importer.assignedTemplateFields;

  importer.selectFile([`${third},${first}`, 'a,b'].join('\n'));

  assert.deepEqual(importer.assignedTemplateFields, [third, first]);
  assert.deepEqual(importer.getDuplicateColumns(), []);

  const headless = new Importer('Customer', fyo);
  headless.selectFile('a,b');
  assert.deepEqual(headless.assignedTemplateFields, [null, null]);
});

test('leaving a column out moves the later picked columns up', async () => {
  const importer = new Importer('Customer', fyo);
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
    'SalesInvoice.customer',
    'SalesInvoiceItem.item_code',
    'SalesInvoiceItem.qty',
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
    ['docstatus', 'customer', 'items.item_code', 'items.qty'],
    ['0', 'Amy', 'Pen', '2'],
    ['', '', 'Pad', '3'],
    ['0', 'Bob', 'Ink', '1'],
  ]);
  assert.deepEqual(file.gridRows, [0, 2, 1]);
  assert.deepEqual(getGridRows(file, [2, 3]), [0, 2]);
  assert.equal(importer.getRowName(2), 'A');
});

test('named documents import their name under the DocType’s fieldname', async () => {
  const lead = new Importer('Lead', fyo);
  lead.assignedTemplateFields = ['Lead.lead_name', 'Lead.email_id'];
  lead.valueMatrix = [[{ value: 'Ann' }, { value: 'ann@example.com' }]];
  assert.deepEqual(importRows(lead), [
    ['docstatus', 'lead_name', 'email_id'],
    ['0', 'Ann', 'ann@example.com'],
  ]);

  const account = new Importer('Account', fyo);
  account.assignedTemplateFields = [
    'Account.account_name',
    'Account.parent_account',
  ];
  account.valueMatrix = [[{ value: 'Petty Cash' }, { value: 'Cash' }]];
  assert.deepEqual(importRows(account), [
    ['docstatus', 'account_name', 'parent_account'],
    ['0', 'Petty Cash', 'Cash'],
  ]);
  // A doctype named by a field groups its rows by that field.
  assert.equal(account.getRowName(0), 'Petty Cash');
});

test('import cells are written as Frappe’s Data Import parses them', async () => {
  const importer = new Importer('SalesInvoice', fyo);
  importer.assignedTemplateFields = [
    'SalesInvoice.name',
    'SalesInvoice.posting_date',
    'SalesInvoice.discount_after_tax',
    'SalesInvoiceItem.price_list_rate',
  ];
  importer.valueMatrix = [
    [
      { value: 'A' },
      { value: new Date(Date.UTC(2026, 8, 30, 4, 35)) },
      { value: true },
      { value: fyo.pesa(12.5) },
    ],
  ];

  assert.deepEqual(importRows(importer)[1], ['0', '2026-09-30', '1', '12.5']);

  // A payment posted on a date and time before; a shift still opens at one.
  const shift = new Importer('POSOpeningEntry', fyo);
  shift.assignedTemplateFields = [
    'POSOpeningEntry.name',
    'POSOpeningEntry.period_start_date',
  ];
  shift.valueMatrix = [
    [{ value: 'A' }, { value: new Date(Date.UTC(2026, 8, 30, 4, 35)) }],
  ];
  assert.deepEqual(importRows(shift)[1], ['0', '2026-09-30 10:05:00.000']);
});

test('import datetimes are read as system time, whatever the browser’s time zone', async () => {
  // The system time zone is Asia/Kolkata; the browser is in Tokyo.
  process.env.TZ = 'Asia/Tokyo';
  const importer = new Importer('POSOpeningEntry', fyo);
  importer.selectFile(
    [
      'POSOpeningEntry.name,POSOpeningEntry.period_start_date',
      'A,2026-01-01',
      'B,2026-01-01 10:00:00',
      'C,2026-01-01T10:00:00+05:30',
    ].join('\n')
  );
  // Hash-named, so no template field names the rows; the file groups them by name.
  importer.assignedTemplateFields[0] = 'POSOpeningEntry.name';
  for (const [name] of importer.valueMatrix) {
    name.value = name.rawValue;
  }

  assert.deepEqual(
    importer.valueMatrix.map(([, date]) => date.error ?? false),
    [false, false, false]
  );
  assert.deepEqual(
    importRows(importer)
      .slice(1)
      .map(([, date]) => date),
    [
      '2026-01-01 00:00:00.000',
      '2026-01-01 10:00:00.000',
      '2026-01-01 10:00:00.000',
    ]
  );
  delete process.env.TZ;
});

test('fix failed keeps the failed rows and the file columns', async () => {
  const importer = new Importer('Customer', fyo);
  importer.assignedTemplateFields = [
    'Customer.email_id',
    'Customer.customer_name',
  ];
  importer.valueMatrix = [
    [{ value: 'a@example.com' }, { value: 'A' }],
    [{ value: 'b@example.com' }, { value: 'B' }],
    [{ value: 'c@example.com' }, { value: 'C' }],
  ];

  importer.keepRows([1, 2]);

  assert.deepEqual(
    importer.valueMatrix.map((row) => row[1].value),
    ['B', 'C']
  );
  assert.deepEqual(importer.assignedTemplateFields, [
    'Customer.email_id',
    'Customer.customer_name',
  ]);
});
