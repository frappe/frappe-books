import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GSTR1, getGstrJsonData, makeFyo } from './helpers/accounting.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

const GSTIN = '27AAAAA0000A1Z5';

test('GSTR shows the server rows and exports one invoice with an item per rate', async () => {
  const fyo = await makeFyo();
  const row = {
    gstin: GSTIN,
    party: 'Customer',
    invoice_no: 'SINV-1',
    invoice_date: '2026-01-01',
    reverse_charge: 'N',
    in_state: true,
    place: 'Maharashtra',
    invoice_value: 459,
  };
  const rows = [
    { ...row, rate: 18, taxable_value: 300, cgst_amount: 27, sgst_amount: 27 },
    { ...row, rate: 5, taxable_value: 100, cgst_amount: 2.5, sgst_amount: 2.5 },
  ];
  const calls = stubServer(() =>
    reportResult(
      [
        ['gstin', 'Data', 180],
        ['invoice_no', 'Data'],
        ['rate', 'Data', 60],
        ['taxable_value', 'Currency'],
        ['igst_amount', 'Currency'],
      ],
      rows
    )
  );
  fyo.getValue = async () => GSTIN;
  const report = new GSTR1(fyo);
  report.transferType = 'B2B';
  report.toDate = '2026-01-31';
  report.filters = report.getFilters();

  await report.setReportData();

  assert.equal(calls[0].args.report_name, 'Books GSTR-1');
  assert.deepEqual(calls[0].args.filters, {
    transfer_type: 'B2B',
    to_date: '2026-01-31',
  });
  assert.deepEqual(
    report.reportData[1].cells.map((cell) => cell.value),
    ['27AAAAA0000A1Z5', 'SINV-1', '5', '100.00', '']
  );
  const itemDetails = (rate, taxVal, tax) => ({
    txval: taxVal,
    rt: rate,
    csamt: 0,
    camt: tax,
    samt: tax,
    iamt: 0,
  });
  assert.deepEqual(JSON.parse(await getGstrJsonData(report)).b2b, [
    {
      ctin: GSTIN,
      inv: [
        {
          inum: 'SINV-1',
          idt: '01-01-2026',
          val: 459,
          pos: '27',
          rchrg: 'N',
          inv_typ: 'R',
          itms: [
            { num: 1, itm_det: itemDetails(18, 300, 27) },
            { num: 2, itm_det: itemDetails(5, 100, 2.5) },
          ],
        },
      ],
    },
  ]);
});
