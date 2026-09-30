import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSidebarPath,
  matchesSidebarPath,
} from '../src/utils/sidebarNavigation.ts';

test('detail and print routes select their source list or report', () => {
  for (const [path, params, sidebarPath, expected] of [
    [
      '/edit/Item/Notebook',
      { schemaName: 'Item' },
      '/list/:schemaName',
      '/list/Item',
    ],
    [
      '/print/Payment/PAY-1',
      { schemaName: 'Payment' },
      '/list/:schemaName',
      '/list/Payment',
    ],
    [
      '/report-print/GeneralLedger',
      { reportName: 'GeneralLedger' },
      '/report/:reportName',
      '/report/GeneralLedger',
    ],
    [
      '/template-builder/Invoice',
      {},
      '/list/PrintFormat',
      '/list/PrintFormat',
    ],
  ]) {
    assert.equal(
      getSidebarPath({ path, params, meta: { sidebarPath } }),
      expected
    );
  }
});

test('filtered lists share document navigation without matching other schemas', () => {
  assert.ok(matchesSidebarPath('/list/Item', '/list/Item/Sales%20Items'));
  assert.ok(matchesSidebarPath('/list/Item/Purchase%20Items', '/list/Item'));
  assert.ok(!matchesSidebarPath('/list/ItemGroup', '/list/Item'));
  assert.ok(!matchesSidebarPath('/report/GeneralLedger', '/'));
  assert.ok(
    !matchesSidebarPath('/report/GeneralLedgerOther', '/report/GeneralLedger')
  );
});
