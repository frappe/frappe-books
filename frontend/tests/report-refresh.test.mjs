import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appFyo, showReport } from './helpers/accounting.mjs';

test('a report shown again refetches its data', async () => {
  const calls = [];
  const report = {
    setFilters: async () => {},
    setReportData: async (...args) => calls.push(args),
  };
  appFyo.store.reports.GeneralLedger = report;

  assert.equal(await showReport('GeneralLedger'), report);
  assert.deepEqual(calls, [[undefined, true]]);
  delete appFyo.store.reports.GeneralLedger;
});
