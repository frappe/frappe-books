import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appFyo,
  getReportDefaultFilters,
  reactive,
  showReport,
  watchSyncEffect,
} from './helpers/accounting.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

test('a report shown again refetches its data', async () => {
  const calls = [];
  const report = {
    get: () => undefined,
    setFilters: async () => {},
    setReportData: async (...args) => calls.push(args),
  };
  appFyo.store.reports.GeneralLedger = report;

  assert.equal(await showReport('GeneralLedger'), report);
  assert.deepEqual(calls, [[undefined, true]]);
  delete appFyo.store.reports.GeneralLedger;
});

test('a report opened with filters runs once on the server', async () => {
  const calls = stubServer((method) =>
    method.endsWith('get_default_filters')
      ? { from_date: '2025-01-01', to_date: '2025-12-31' }
      : reportResult([['account', 'Data']], [])
  );
  const runs = () =>
    calls.filter((c) => c.method === 'frappe.desk.query_report.run');
  const filters = { referenceType: 'Books Payment', party: 'Acme' };

  const report = await showReport('GeneralLedger', filters);
  assert.equal(runs().length, 1);
  assert.equal(runs()[0].args.filters.party, 'Acme');
  assert.equal(runs()[0].args.filters.reference_type, 'Books Payment');

  assert.equal(await showReport('GeneralLedger', { party: 'Beta' }), report);
  assert.equal(runs().length, 2);
  assert.equal(runs()[1].args.filters.party, 'Beta');
  delete appFyo.store.reports.GeneralLedger;
});

test('a report shown again with new filters updates the page', async () => {
  stubServer((method) =>
    method.endsWith('get_default_filters')
      ? { from_date: '2025-01-01', to_date: '2025-12-31' }
      : reportResult([['account', 'Data']], [])
  );
  const page = reactive(await showReport('GeneralLedger', { party: 'Acme' }));
  const shown = [];
  watchSyncEffect(() => shown.push(page.get('party')));

  await showReport('GeneralLedger', { party: 'Beta' });
  assert.equal(shown.at(-1), 'Beta');
  delete appFyo.store.reports.GeneralLedger;
});

test('phone filter defaults reuse the fetched server defaults', async () => {
  const calls = stubServer((method) =>
    method.endsWith('get_default_filters')
      ? { from_date: '2025-01-01', to_date: '2025-12-31' }
      : reportResult([['account', 'Data']], [])
  );
  const report = await showReport('GeneralLedger', { party: 'Acme' });

  const defaults = await getReportDefaultFilters(report);
  assert.equal(defaults.party, null);
  assert.equal(defaults.toDate, '2025-12-31');
  const defaultCalls = calls.filter((c) =>
    c.method.endsWith('get_default_filters')
  );
  assert.equal(defaultCalls.length, 1);
  delete appFyo.store.reports.GeneralLedger;
});

test('a report opened without Ref filters drops those it was opened with before', async () => {
  const calls = stubServer((method) =>
    method.endsWith('get_default_filters')
      ? { from_date: '2025-01-01', to_date: '2025-12-31' }
      : reportResult([['account', 'Data']], [])
  );
  const document = { referenceType: 'Books Payment', referenceName: 'PAY-1' };
  await showReport('GeneralLedger', { ...document, party: 'Acme' });

  const report = await showReport('GeneralLedger');

  const run = calls.filter((c) => c.method === 'frappe.desk.query_report.run');
  assert.equal(run.at(-1).args.filters.reference_type, 'All');
  assert.equal(run.at(-1).args.filters.reference_name, undefined);
  assert.equal(report.get('party'), 'Acme');
  delete appFyo.store.reports.GeneralLedger;
});

test('a report opened without Ref filters resets the dates a document link set', async () => {
  const calls = stubServer((method) =>
    method.endsWith('get_default_filters')
      ? { from_date: '2025-01-01', to_date: '2025-12-31' }
      : reportResult([['account', 'Data']], [])
  );
  const runs = () =>
    calls.filter((c) => c.method === 'frappe.desk.query_report.run');
  const day = { fromDate: '2025-03-04', toDate: '2025-03-04' };
  const document = { referenceType: 'Books Payment', referenceName: 'PAY-1' };
  await showReport('GeneralLedger', { ...document, ...day });

  await showReport('GeneralLedger');
  assert.equal(runs().at(-1).args.filters.from_date, '2025-01-01');
  assert.equal(runs().at(-1).args.filters.to_date, '2025-12-31');

  await showReport('GeneralLedger', day);
  await showReport('GeneralLedger');
  assert.equal(runs().at(-1).args.filters.from_date, '2025-03-04');
  delete appFyo.store.reports.GeneralLedger;
});
