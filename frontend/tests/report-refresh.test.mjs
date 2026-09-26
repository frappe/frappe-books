import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMethod } from './helpers/vue-method.mjs';

test('a report shown again refetches its data', async () => {
  const calls = [];
  const report = {
    reportData: [{ cells: [] }],
    setReportData: async (...args) => calls.push(args),
  };
  const setReportData = await loadMethod(
    'src/pages/Report.vue',
    'setReportData',
    { getReport: async () => report }
  );
  const page = { report: null, reportClassName: 'GeneralLedger' };

  await setReportData.call(page);
  assert.deepEqual(calls, []);
  await setReportData.call(page);
  assert.deepEqual(calls, [[undefined, true]]);
});
