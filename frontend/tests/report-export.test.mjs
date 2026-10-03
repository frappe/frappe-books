import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  GSTR1,
  GeneralLedger,
  getCsvData,
  getJsonData,
  makeFyo,
} from './helpers/accounting.mjs';

after(() => {
  delete globalThis.window;
});

function bootWithExport(canExport) {
  globalThis.window = {
    frappe: {
      boot: {
        allowed_reports: {
          'Books General Ledger': { ref_doctype: 'Books Ledger Entry' },
          'Books GSTR-1': { ref_doctype: 'Books Sales Invoice' },
        },
        user: { can_export: canExport },
      },
    },
  };
}

test('reports offer CSV and JSON only when their doctype can be exported', async () => {
  const fyo = await makeFyo();
  const labels = (report) => report.getActions().map((action) => action.label);

  bootWithExport(['Books Ledger Entry']);
  assert.deepEqual(labels(new GeneralLedger(fyo)), ['CSV', 'JSON']);
  assert.deepEqual(labels(new GSTR1(fyo)), []);

  bootWithExport(['Books Sales Invoice']);
  assert.deepEqual(labels(new GeneralLedger(fyo)), []);
  assert.deepEqual(labels(new GSTR1(fyo)), ['CSV', 'JSON']);
});

test('CSV and JSON give quantities to the float precision, amounts to the display precision', async () => {
  const fyo = await makeFyo();
  fyo.singles.SystemSettings.display_precision = 0;
  globalThis.window = {
    frappe: { boot: { sysdefaults: { float_precision: '3' } } },
  };
  const report = {
    fyo,
    reportName: 'stock-balance',
    filters: [],
    columns: [
      { fieldname: 'balance_quantity', label: 'Qty', fieldtype: 'Float' },
      { fieldname: 'balance_value', label: 'Value', fieldtype: 'Currency' },
    ],
    reportData: [
      {
        cells: [
          { value: '2.5', rawValue: 2.5 },
          { value: '13', rawValue: 12.5 },
        ],
      },
    ],
  };

  assert.deepEqual(JSON.parse(getJsonData(report)).rows, [
    { Qty: '2.500', Value: '13' },
  ]);
  assert.match(getCsvData(report), /2\.500,13/);
});
