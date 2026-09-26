import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showReport } from './helpers/accounting.mjs';

test('a report shown again refetches its data', async () => {
  const calls = [];
  const report = { setReportData: async (...args) => calls.push(args) };

  assert.equal(await showReport(report, 'GeneralLedger'), report);
  assert.deepEqual(calls, [[undefined, true]]);
});
