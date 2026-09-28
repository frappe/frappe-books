import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GSTR1, getGstrJsonData, makeFyo } from './helpers/accounting.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

const GSTIN = '27AAAAA0000A1Z5';

test('GSTR shows the server rows and asks the server for the JSON export', async () => {
  const fyo = await makeFyo();
  const row = { gstin: GSTIN, invoice_no: 'SINV-1', igst_amount: undefined };
  const gstrJson = { gstin: GSTIN, fp: '012026', b2b: [] };
  const calls = stubServer((method) => {
    if (method.endsWith('get_default_filters'))
      return {
        from_date: '2025-10-31',
        to_date: '2026-01-31',
        transfer_type: 'B2B',
      };
    if (method.endsWith('get_gstr_json')) return gstrJson;
    return reportResult(
      [
        ['gstin', 'Data', 180],
        ['invoice_no', 'Data'],
        ['rate', 'Data', 60],
        ['taxable_value', 'Currency'],
        ['igst_amount', 'Currency'],
      ],
      [
        { ...row, rate: 18, taxable_value: 300 },
        { ...row, rate: 5, taxable_value: 100 },
      ]
    );
  });
  fyo.store.indianStates = { 27: 'Maharashtra' };
  const report = new GSTR1(fyo);

  await report.initialize();

  const filters = {
    transfer_type: 'B2B',
    from_date: '2025-10-31',
    to_date: '2026-01-31',
  };
  const run = calls.find((c) => c.method === 'frappe.desk.query_report.run');
  assert.deepEqual(run.args.filters, filters);
  assert.equal(run.args.report_name, 'Books GSTR-1');
  assert.deepEqual(
    report.filters.find((f) => f.fieldname === 'place').options,
    [{ value: '27', label: 'Maharashtra' }]
  );
  assert.deepEqual(
    report.reportData[1].cells.map((cell) => cell.value),
    [GSTIN, 'SINV-1', '5', '100.00', '']
  );
  assert.deepEqual(JSON.parse(await getGstrJsonData(report)), gstrJson);
  assert.deepEqual(calls.at(-1).args, { report_name: 'Books GSTR-1', filters });
});
