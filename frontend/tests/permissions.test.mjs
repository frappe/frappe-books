import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportsOwnDocumentsOnly,
  hasPermission,
} from '../fyo/utils/permissions.ts';
import {
  fyo,
  getImportableSchemaNames,
  getSidebarConfig,
  loadDocPermissions,
  Search,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

const doctypes = { SalesInvoice: 'Books Sales Invoice', Tax: 'Books Tax' };
await loadFrappeModels();

/** A saved document of the schema, as a form loads it. */
function getSaved(schemaName, name) {
  const doc = newFrappeDoc(schemaName, { name });
  doc._notInserted = false;
  return doc;
}

test('permissions come from the boot lists of frappe.boot.user', () => {
  const user = {
    can_read: ['Books Sales Invoice', 'Books Tax'],
    can_submit: ['Books Sales Invoice'],
  };
  const permissions = { doctypes, user };
  assert.equal(hasPermission(permissions, 'SalesInvoice', 'submit'), true);
  assert.equal(hasPermission(permissions, 'SalesInvoice', 'cancel'), false);
  assert.equal(hasPermission(permissions, 'Tax', 'write'), false);
  assert.equal(hasPermission(permissions, 'Party', 'read'), false);
});

test('a System Manager can export every doctype, as in Frappe', () => {
  const permissions = { doctypes, user: { roles: ['System Manager'] } };
  assert.equal(hasPermission(permissions, 'Tax', 'export'), true);
  assert.equal(hasPermission(permissions, 'Tax', 'print'), false);
});

test('without boot permissions nothing is restricted', () => {
  assert.equal(hasPermission(null, 'Tax', 'delete'), true);
});

test('a saved document uses the rights the server returned for it', () => {
  fyo.store.permissions = {
    doctypes: { Payment: 'Books Payment' },
    user: { can_write: ['Books Payment'], can_delete: ['Books Payment'] },
  };
  const payment = getSaved('Payment', 'PAY-0001');
  assert.equal(payment.canWrite, true);
  assert.equal(payment.canDelete, true);

  payment.docPermissions = { read: 1, write: 0, delete: 0 };
  assert.equal(payment.canWrite, false);
  assert.equal(payment.canDelete, false);
});

test("a form loads the user's rights on its saved document from Frappe", async () => {
  fyo.store.permissions = {
    doctypes: { Payment: 'Books Payment' },
    user: { can_write: ['Books Payment'] },
  };
  const requests = stubFrappe(() => ({
    message: { permissions: { read: 1, write: 0 } },
  }));
  const payment = getSaved('Payment', 'PAY-0002');

  await loadDocPermissions(payment);

  assert.equal(
    requests[0].path,
    '/api/method/frappe.client.get_doc_permissions'
  );
  assert.deepEqual(requests[0].body, {
    doctype: 'Books Payment',
    docname: 'PAY-0002',
  });
  assert.equal(payment.canWrite, false);
});

test('printing a document needs the print permission', () => {
  fyo.store.permissions = {
    doctypes: { Payment: 'Books Payment' },
    user: { can_read: ['Books Payment'] },
  };
  const payment = getSaved('Payment', 'PAY-0001');
  assert.equal(payment.can('print'), false);

  payment.docPermissions = { read: 1, print: 1 };
  assert.equal(payment.can('print'), true);
});

test('the import wizard offers only the schemas the user may import', () => {
  fyo.store.permissions = {
    doctypes: { Party: 'Books Party', Tax: 'Books Tax' },
    user: { can_import: ['Books Party'] },
  };
  assert.deepEqual(getImportableSchemaNames(fyo), ['Party']);
});

test('export granted only to owners exports only the user’s documents', () => {
  const permissions = {
    doctypes,
    user: { can_export: ['Books Tax'], can_export_owner_only: ['Books Tax'] },
  };
  assert.equal(exportsOwnDocumentsOnly(permissions, 'Tax'), true);
  assert.equal(exportsOwnDocumentsOnly(permissions, 'SalesInvoice'), false);
  assert.equal(exportsOwnDocumentsOnly(null, 'Tax'), false);
});

test('a new single document is writable with the write permission', () => {
  fyo.store.permissions = {
    doctypes: { SetupWizard: 'Books Setup Wizard' },
    user: { can_write: ['Books Setup Wizard'] },
  };
  const wizard = newFrappeDoc('SetupWizard');
  assert.equal(wizard.notInserted, true);
  assert.equal(wizard.canWrite, true);
});

test('the sidebar shows only the lists and reports the user can open', () => {
  const lists = ['SalesQuote', 'SalesInvoice', 'Party', 'Item', 'Account'];
  fyo.store.permissions = {
    doctypes: Object.fromEntries(lists.map((name) => [name, `Books ${name}`])),
    user: { can_read: ['Books SalesQuote', 'Books Party'] },
  };
  window.frappe.boot.allowed_reports = { 'Books Trial Balance': {} };

  const sidebar = getSidebarConfig().map(({ label, route, items }) => ({
    label,
    route,
    items: items?.map((item) => item.label),
  }));

  delete window.frappe.boot.allowed_reports;
  assert.deepEqual(sidebar, [
    { label: 'Dashboard', route: '/', items: undefined },
    {
      label: 'Sales',
      route: '/list/SalesQuote',
      items: ['Sales Quotes', 'Customers'],
    },
    {
      label: 'Purchases',
      route: '/list/Party/Suppliers',
      items: ['Suppliers'],
    },
    { label: 'Common', route: '/list/Party', items: ['Party'] },
    {
      label: 'Reports',
      route: '/report/TrialBalance',
      items: ['Trial Balance'],
    },
    { label: 'Setup', route: '/settings', items: ['Settings'] },
  ]);
});

test('Setup lists Number Series for a user who can read them', () => {
  const setupItems = (canRead) => {
    fyo.store.permissions = {
      doctypes: { NumberSeries: 'Books Number Series' },
      user: { can_read: canRead ? ['Books Number Series'] : [] },
    };
    const setup = getSidebarConfig().find(({ label }) => label === 'Setup');
    return setup.items.map(({ label }) => label);
  };

  assert.ok(setupItems(true).includes('Number Series'));
  assert.ok(!setupItems(false).includes('Number Series'));
});

test('the search palette offers only the lists and reports the user can open', () => {
  const lists = ['SalesQuote', 'SalesInvoice', 'Party', 'Item', 'Account'];
  fyo.store.permissions = {
    doctypes: Object.fromEntries(lists.map((name) => [name, `Books ${name}`])),
    user: { can_read: ['Books SalesQuote', 'Books Party'] },
  };
  window.frappe.boot.allowed_reports = { 'Books Trial Balance': {} };

  const routes = new Search(fyo)._nonDocSearchList
    .filter(({ group }) => group === 'List' || group === 'Report')
    .map(({ route }) => decodeURI(route).split('?')[0]);

  delete window.frappe.boot.allowed_reports;
  assert.ok(routes.includes('/list/SalesQuote'));
  assert.ok(routes.includes('/list/Party/Customers'));
  assert.ok(routes.includes('/report/TrialBalance'));
  assert.ok(!routes.includes('/list/SalesInvoice'));
  assert.ok(!routes.some((route) => route.startsWith('/list/Item')));
  assert.ok(!routes.includes('/report/GeneralLedger'));
});
