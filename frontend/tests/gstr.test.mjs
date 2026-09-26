import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GSTR1, getGstrJsonData, makeFyo } from './helpers/accounting.mjs';

const GSTIN = '27AAAAA0000A1Z5';

test('GSTR shows the server rows and exports one invoice with an item per rate', async () => {
  const fyo = await makeFyo();
  const row = {
    gstin: GSTIN,
    partyName: 'Customer',
    invNo: 'SINV-1',
    invDate: '2026-01-01',
    reverseCharge: 'N',
    inState: true,
    place: 'Maharashtra',
    invAmt: 459,
  };
  const rows = [
    { ...row, rate: 18, taxVal: 300, cgstAmt: 27, sgstAmt: 27 },
    { ...row, rate: 5, taxVal: 100, cgstAmt: 2.5, sgstAmt: 2.5 },
  ];
  let call;
  fyo.db.getReportData = async (...args) => {
    call = args;
    return rows;
  };
  fyo.getValue = async () => GSTIN;
  const report = new GSTR1(fyo);
  report.transferType = 'B2B';
  report.toDate = '2026-01-31';
  report.filters = report.getFilters();
  report.columns = await report.getColumns();

  await report.setReportData();

  assert.deepEqual(call, [
    'getGSTRRows',
    'SalesInvoice',
    { transferType: 'B2B', toDate: '2026-01-31' },
  ]);
  assert.equal(report.reportData.length, 2);
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
