import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCSV } from './helpers/accounting.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  getCsvExportData,
  getDocType,
  getExportFields,
  getExportTableFields,
  getJsonExportData,
  getSchema,
  stubFrappe,
} from './helpers/frappe.mjs';

await loadFrappeModels(frappeModels);

const field = (fieldname, label, fieldtype = 'Data') => ({
  fieldname,
  label,
  fieldtype,
  export: true,
});

test('the wizard offers the fields of the DocType and of its tables', () => {
  const exported = getExportFields('SalesInvoice');
  const items = getExportTableFields('SalesInvoice').find(
    ({ fieldname }) => fieldname === 'items'
  );

  assert.deepEqual(
    exported.slice(0, 2).map(({ fieldname, label }) => [fieldname, label]),
    [
      ['name', 'Invoice No'],
      ['number_series', 'Number Series'],
    ]
  );
  assert.equal(
    exported.find(({ fieldname }) => fieldname === 'attachment').export,
    false
  );
  assert.equal(items.target, 'SalesInvoiceItem');
  assert.ok(items.fields.some(({ fieldname }) => fieldname === 'item'));
  assert.ok(!items.fields.some(({ fieldname }) => fieldname === 'name'));
});

test('party and address exports leave out Indian GST fields', () => {
  const exported = (schemaName) =>
    getExportFields(schemaName).map((f) => f.fieldname);

  assert.ok(exported('Party').includes('tax_id'));
  assert.ok(!exported('Party').includes('gst_type'));
  assert.ok(!exported('Party').includes('gstin'));
  assert.ok(!exported('Address').includes('pos'));
});

test('the file fields of every model are fields of its schema', () => {
  const schemaNames = Object.keys(frappeModels).flatMap((schemaName) => [
    schemaName,
    ...Object.values(getDocType(schemaName).tables).map(
      ({ schema }) => schema.name
    ),
  ]);
  const missing = schemaNames.flatMap((schemaName) => {
    const { fields, fileFields = [] } = getSchema(schemaName);
    return fileFields
      .filter((fieldname) => !fields.some((f) => f.fieldname === fieldname))
      .map((fieldname) => `${schemaName}.${fieldname}`);
  });

  assert.deepEqual(missing, []);
  assert.ok(getSchema('SalesInvoice').fileFields.length > 0);
  assert.ok(getSchema('SalesQuoteItem').fileFields.length > 0);
});

test('every exported table is headed by the label of its rows, not their doctype', () => {
  const lists = Object.keys(frappeModels).filter(
    (schemaName) => !getDocType(schemaName).meta.issingle
  );
  const doctypeLabels = lists.flatMap((schemaName) =>
    Object.values(getDocType(schemaName).tables)
      .filter(({ doctype, schema }) => schema.label === doctype)
      .map(({ doctype }) => `${schemaName}: ${doctype}`)
  );

  assert.deepEqual(doctypeLabels, []);
  assert.equal(getSchema('TaxDetail').label, 'Tax Detail');
  assert.equal(getSchema('UomConversionItem').label, 'UOM Conversion Item');
});

test('a list exports from the framework a page at a time, in list order', async () => {
  const names = Array.from({ length: 700 }, (_, i) => ({ name: `JV-${i}` }));
  const requests = stubFrappe(({ params }) => ({
    data: names.slice(params.start, params.start + params.limit),
  }));
  const query = {
    schemaName: 'JournalEntry',
    fields: [field('name', 'Entry No')],
    tableFields: [],
    filters: { name: ['like', 'JV%'], submitted: ['=', 1] },
  };

  const limited = await getJsonExportData({ ...query, limit: 1 });
  assert.deepEqual(JSON.parse(limited), [{ name: 'JV-0' }]);
  assert.equal(requests[0].path, '/api/v2/document/Books Journal Entry');
  assert.deepEqual(requests[0].params, {
    fields: ['name'],
    filters: [
      ['name', 'like', 'JV%'],
      ['docstatus', 'in', [1, 2]],
    ],
    order_by: 'posting_date desc, creation desc',
    start: 0,
    limit: 1,
  });

  requests.length = 0;
  const all = await getJsonExportData({ ...query, limit: null });
  assert.equal(JSON.parse(all).length, 700);
  assert.deepEqual(
    requests.map(({ params }) => [params.start, params.limit]),
    [
      [0, 500],
      [500, 500],
    ]
  );
});

test("CSV repeats a document's values on each row of its tables", async () => {
  const requests = stubFrappe(() => ({
    data: [
      {
        name: 'SINV-1',
        party: 'Acme',
        items: [
          { item: 'Pen', rate: 10 },
          { item: 'Ink', rate: 5 },
        ],
      },
      { name: 'SINV-2', party: 'Bolt', items: [] },
    ],
  }));
  const csv = await getCsvExportData({
    schemaName: 'SalesInvoice',
    fields: [
      field('name', 'Invoice No'),
      field('party', 'Customer'),
      field('total_discount', 'Discount', 'Currency'),
      field('items', 'Items', 'Table'),
    ],
    tableFields: [
      {
        fieldname: 'items',
        label: 'Items',
        target: 'SalesInvoiceItem',
        fields: [field('item', 'Item'), field('rate', 'Rate', 'Currency')],
      },
    ],
    limit: null,
    filters: {},
  });

  // A virtual field has no column to read.
  assert.deepEqual(requests[0].params.fields, [
    'name',
    'party',
    { items: ['item', 'rate'] },
  ]);
  assert.deepEqual(parseCSV(csv), [
    ['Invoice No', 'Customer', 'Discount', 'Item', 'Rate'],
    [
      'SalesInvoice.name',
      'SalesInvoice.party',
      'SalesInvoice.total_discount',
      'SalesInvoiceItem.item',
      'SalesInvoiceItem.rate',
    ],
    ['SINV-1', 'Acme', '', 'Pen', '10'],
    ['SINV-1', 'Acme', '', 'Ink', '5'],
    ['SINV-2', 'Bolt', '', '', ''],
  ]);
});
