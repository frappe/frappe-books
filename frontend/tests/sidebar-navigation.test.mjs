import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findSidebarEntry,
  getFilteredLists,
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
        { name: 'payments', route: '/list/Payment/Sales Payments' },
      ],
    },
    {
      name: 'purchases',
      route: '/list/PurchaseInvoice',
      items: [{ name: 'payments', route: '/list/Payment/Purchase Payments' }],
    },
  ];
  const ownerOf = (path, params = {}, meta = {}) => {
    const entry = findSidebarEntry(groups, { path, params, meta });
    return entry && `${entry.group.name}/${entry.item.name}`;
  };

  assert.equal(ownerOf('/'), 'dashboard/dashboard');
  assert.equal(
    ownerOf('/list/Payment/Purchase%20Payments'),
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

test("a record's form offers the filtered lists of its doctype to belong to", () => {
  const sales = {
    name: 'sales',
    route: '/list/Payment/Sales Payments',
    filters: [['reference_type', '=', 'SalesInvoice']],
  };
  const purchases = {
    name: 'purchases',
    route: '/list/Payment/Purchase Payments',
    filters: [['reference_type', '=', 'PurchaseInvoice']],
  };
  const groups = [
    { name: 'sales', route: '/list/SalesInvoice', items: [sales] },
    { name: 'purchases', route: '/list/PurchaseInvoice', items: [purchases] },
    {
      name: 'items',
      route: '/list/Item',
      items: [{ name: 'item', route: '/list/Item' }],
    },
  ];
  const route = (schemaName) => ({
    path: `/edit/${schemaName}/X-1`,
    params: { schemaName, name: 'X-1' },
    meta: { sidebarPath: '/list/:schemaName' },
  });

  assert.deepEqual(
    getFilteredLists(groups, route('Payment')).map(({ item }) => item),
    [sales, purchases]
  );
  assert.deepEqual(getFilteredLists(groups, route('Item')), []);
});
