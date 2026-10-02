import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  GeneralLedger,
  getCsvData,
  getJsonData,
  getLedgerLink,
  getRowReference,
  newFrappeDoc,
} from './helpers/frappe.mjs';

await loadFrappeModels(frappeModels);

function getReport(canRead = true) {
  const report = new GeneralLedger(fyo);
  report.fyo = Object.assign(Object.create(fyo), { can: () => canRead });
  report.columns = ['reference_type', 'reference_name'].map((fieldname) => ({
    fieldname,
    label: fieldname,
    fieldtype: 'Data',
  }));
  return report;
}

test('a ledger row shows its doctype by the schema label and opens the document', () => {
  const report = getReport();
  const row = report.getReportRow({
    reference_type: 'Books Sales Invoice',
    reference_name: 'SINV-1001',
  });

  assert.deepEqual(
    row.cells.map(({ value }) => value),
    ['Sales Invoice', 'SINV-1001']
  );
  assert.deepEqual(getRowReference(report, row), {
    schemaName: 'SalesInvoice',
    name: 'SINV-1001',
  });
  assert.equal(getRowReference(getReport(false), row), null);
});

/** The report's From and To dates after it opens with the link's filters. */
async function getLinkedDates(link) {
  const report = new GeneralLedger(fyo);
  report.filters = report.getFilters();
  const filters = JSON.parse(link.query.defaultFilters);
  await report.set('fromDate', filters.fromDate, false);
  await report.set('toDate', filters.toDate, false);
  return [report.fromDate, report.toDate];
}

test("a document's ledger opens filtered by its doctype, on its posting date", async () => {
  // Half past midnight in the system time zone, the evening before in UTC.
  const date = new Date('2020-05-01T00:30:00+05:30');
  const shipment = newFrappeDoc('Shipment', { name: 'SHPM-1001', date });
  const link = getLedgerLink(shipment, 'StockLedger');

  const { referenceType, referenceName } = JSON.parse(
    link.query.defaultFilters
  );
  assert.deepEqual(
    [referenceType, referenceName],
    ['Books Shipment', 'SHPM-1001']
  );
  assert.deepEqual(await getLinkedDates(link), ['2020-05-01', '2020-05-01']);
});

test('a journal entry ledger opens on its posting date', async () => {
  const entry = newFrappeDoc('JournalEntry', {
    posting_date: new Date(2019, 11, 31),
  });

  const link = getLedgerLink(entry, 'GeneralLedger');

  assert.deepEqual(await getLinkedDates(link), ['2019-12-31', '2019-12-31']);
});

test('report files name a reference type by its schema, as before', () => {
  const report = getReport();
  report.reportData = [
    report.getReportRow({
      reference_type: 'Books Sales Invoice',
      reference_name: 'SINV-1001',
    }),
  ];
  report.filters = [{ fieldname: 'referenceType', fieldtype: 'Select' }];
  report.referenceType = 'Books Sales Invoice';

  const json = JSON.parse(getJsonData(report));
  assert.deepEqual(json.rows, [
    { reference_type: 'SalesInvoice', reference_name: 'SINV-1001' },
  ]);
  assert.deepEqual(json.filters, { referenceType: 'SalesInvoice' });
  assert.equal(
    getCsvData(report),
    'reference_type,reference_name\r\nSalesInvoice,SINV-1001'
  );

  report.referenceType = 'All';
  assert.deepEqual(JSON.parse(getJsonData(report)).filters, {
    referenceType: 'All',
  });
});
