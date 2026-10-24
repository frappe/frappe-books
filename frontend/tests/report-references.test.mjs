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
  StockLedger,
} from './helpers/frappe.mjs';

await loadFrappeModels(frappeModels);

function getReport(canRead = true) {
  const report = new GeneralLedger(fyo);
  report.fyo = Object.assign(Object.create(fyo), { can: () => canRead });
  report.columns = ['voucher_type', 'voucher_no'].map((fieldname) => ({
    fieldname,
    label: fieldname,
    fieldtype: 'Data',
  }));
  return report;
}

test('a ledger row shows its doctype by the schema label and opens the document', () => {
  const report = getReport();
  const row = report.getReportRow({
    voucher_type: 'Books Sales Invoice',
    voucher_no: 'SINV-1001',
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
  const shipment = newFrappeDoc('DeliveryNote', {
    name: 'SHPM-1001',
    posting_date: date,
  });
  const link = getLedgerLink(shipment, 'StockLedger');

  // The stock ledger picks a document by ERPNext's voucher fields.
  const { voucherType, voucherNo } = JSON.parse(link.query.defaultFilters);
  assert.deepEqual(
    [voucherType, voucherNo],
    ['Books Delivery Note', 'SHPM-1001']
  );
  assert.deepEqual(await getLinkedDates(link), ['2020-05-01', '2020-05-01']);
});

test('a stock ledger row opens the document of its voucher', () => {
  const report = new StockLedger(fyo);
  report.fyo = Object.assign(Object.create(fyo), { can: () => true });
  report.columns = ['voucher_type', 'voucher_no'].map((fieldname) => ({
    fieldname,
    label: fieldname,
    fieldtype: 'Data',
  }));
  const row = report.getReportRow({
    voucher_type: 'Books Stock Entry',
    voucher_no: 'STE-1001',
  });

  assert.deepEqual(
    row.cells.map(({ value }) => value),
    ['Stock Entry', 'STE-1001']
  );
  assert.deepEqual(getRowReference(report, row), {
    schemaName: 'StockEntry',
    name: 'STE-1001',
  });
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
      voucher_type: 'Books Sales Invoice',
      voucher_no: 'SINV-1001',
    }),
  ];
  report.filters = [{ fieldname: 'voucherType', fieldtype: 'Select' }];
  report.voucherType = 'Books Sales Invoice';

  const json = JSON.parse(getJsonData(report));
  assert.deepEqual(json.rows, [
    { voucher_type: 'SalesInvoice', voucher_no: 'SINV-1001' },
  ]);
  assert.deepEqual(json.filters, { voucherType: 'SalesInvoice' });
  assert.equal(
    getCsvData(report),
    'voucher_type,voucher_no\r\nSalesInvoice,SINV-1001'
  );

  report.voucherType = 'All';
  assert.deepEqual(JSON.parse(getJsonData(report)).filters, {
    voucherType: 'All',
  });
});
