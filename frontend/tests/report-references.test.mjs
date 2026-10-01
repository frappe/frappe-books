import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  GeneralLedger,
  getLedgerLink,
  getRowReference,
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

test("a document's ledger opens filtered by its doctype", () => {
  const link = getLedgerLink(
    { schemaName: 'Shipment', name: 'SHPM-1001' },
    'StockLedger'
  );

  assert.deepEqual(JSON.parse(link.query.defaultFilters), {
    referenceType: 'Books Shipment',
    referenceName: 'SHPM-1001',
  });
});
