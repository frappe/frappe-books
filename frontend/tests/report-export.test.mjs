import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { GSTR1, GeneralLedger, makeFyo } from './helpers/accounting.mjs';

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
