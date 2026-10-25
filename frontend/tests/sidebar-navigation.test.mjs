import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findSidebarEntry,
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
      '/print/PaymentEntry/PAY-1',
      { schemaName: 'PaymentEntry' },
      '/list/:schemaName',
      '/list/PaymentEntry',
    ],
    [
      '/report-print/GeneralLedger',
      { reportName: 'GeneralLedger' },
      '/report/:reportName',
      '/report/GeneralLedger',
    ],
    ['/template-builder/Invoice', {}, '/list/PrintFormat', '/list/PrintFormat'],
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

test('a route belongs to the group whose entry has its exact path', () => {
  const groups = [
    { name: 'dashboard', route: '/' },
    {
      name: 'sales',
      route: '/list/SalesInvoice',
      items: [
        { name: 'invoices', route: '/list/SalesInvoice' },
        { name: 'payments', route: '/list/Payment/Sales Payment' },
      ],
    },
    {
      name: 'purchases',
      route: '/list/PurchaseInvoice',
      items: [{ name: 'payments', route: '/list/Payment/Purchase Payment' }],
    },
  ];
  const ownerOf = (path, params = {}, meta = {}) => {
    const entry = findSidebarEntry(groups, { path, params, meta });
    return entry && `${entry.group.name}/${entry.item.name}`;
  };

  assert.equal(ownerOf('/'), 'dashboard/dashboard');
  assert.equal(
    ownerOf('/list/Payment/Purchase%20Payment'),
    'purchases/payments'
  );
  assert.equal(ownerOf('/list/Payment'), 'sales/payments');
  assert.equal(
    ownerOf(
      '/edit/SalesInvoice/SINV-1',
      { schemaName: 'SalesInvoice' },
      { sidebarPath: '/list/:schemaName' }
    ),
    'sales/invoices'
  );
  assert.equal(ownerOf('/settings'), undefined);
});

test('a form of a doctype two entries list stays under the one it was opened from', () => {
  const sales = { name: 'sales', route: '/list/Payment/Sales Payment' };
  const purchases = {
    name: 'purchases',
    route: '/list/Payment/Purchase Payment',
  };
  const groups = [
    { name: 'sales', route: sales.route, items: [sales] },
    { name: 'purchases', route: purchases.route, items: [purchases] },
  ];
  const form = {
    path: '/edit/Payment/PAY-1',
    params: { schemaName: 'Payment' },
    meta: { sidebarPath: '/list/:schemaName' },
  };
  const list = findSidebarEntry(groups, {
    path: '/list/Payment/Purchase%20Payment',
    params: {},
    meta: {},
  });

  assert.equal(findSidebarEntry(groups, form, list)?.item, purchases);
  assert.equal(findSidebarEntry(groups, form)?.item, sales);
});
