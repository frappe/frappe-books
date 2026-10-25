import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportsOwnDocumentsOnly,
  hasPermission,
} from '../fyo/utils/permissions.ts';
import {
  fyo,
  getDocType,
  getImportableSchemaNames,
  getModel,
  getSidebarConfig,
  loadDocPermissions,
  loadSaved,
  Search,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

const doctypes = { SalesInvoice: 'Books Sales Invoice', Tax: 'Books Tax' };
await loadFrappeModels();

/** A saved document of the schema, as a form loads it. */
async function getSaved(schemaName, name) {
  const doc = newFrappeDoc(schemaName, { name });
  await loadSaved(doc);
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
  assert.equal(hasPermission(permissions, 'Customer', 'read'), false);
});

test('a System Manager can export every doctype, as in Frappe', () => {
  const permissions = { doctypes, user: { roles: ['System Manager'] } };
  assert.equal(hasPermission(permissions, 'Tax', 'export'), true);
  assert.equal(hasPermission(permissions, 'Tax', 'print'), false);
});

test('without boot permissions nothing is restricted', () => {
  assert.equal(hasPermission(null, 'Tax', 'delete'), true);
});

test('a saved document uses the rights the server returned for it', async () => {
  fyo.store.permissions = {
    doctypes: { PaymentEntry: 'Books Payment Entry' },
    user: {
      can_write: ['Books Payment Entry'],
      can_delete: ['Books Payment Entry'],
    },
  };
  const payment = await getSaved('PaymentEntry', 'PAY-0001');
  assert.equal(payment.canWrite, true);
  assert.equal(payment.canDelete, true);

  payment.docPermissions = { read: 1, write: 0, delete: 0 };
  assert.equal(payment.canWrite, false);
  assert.equal(payment.canDelete, false);
});

test("a form loads the user's rights on its saved document from Frappe", async () => {
  fyo.store.permissions = {
    doctypes: { PaymentEntry: 'Books Payment Entry' },
    user: { can_write: ['Books Payment Entry'] },
  };
  const requests = stubFrappe(() => ({
    message: { permissions: { read: 1, write: 0 } },
  }));
  const payment = await getSaved('PaymentEntry', 'PAY-0002');

  await loadDocPermissions(payment);

  assert.equal(
    requests[0].path,
    '/api/method/frappe.client.get_doc_permissions'
  );
  assert.deepEqual(requests[0].body, {
    doctype: 'Books Payment Entry',
    docname: 'PAY-0002',
  });
  assert.equal(payment.canWrite, false);
});

test('printing a document needs the print permission', async () => {
  fyo.store.permissions = {
    doctypes: { PaymentEntry: 'Books Payment Entry' },
    user: { can_read: ['Books Payment Entry'] },
  };
  const payment = await getSaved('PaymentEntry', 'PAY-0001');
  assert.equal(payment.can('print'), false);

  payment.docPermissions = { read: 1, print: 1 };
  assert.equal(payment.can('print'), true);
});

test('the import wizard offers only the schemas the user may import', () => {
  fyo.store.permissions = {
    doctypes: { Customer: 'Books Customer', Tax: 'Books Tax' },
    user: { can_import: ['Books Customer'], can_create: ['Data Import'] },
  };
  assert.deepEqual(getImportableSchemaNames(fyo), ['Customer']);
});

test('the import wizard offers nothing to who cannot make a Data Import', () => {
  fyo.store.permissions = {
    doctypes: { Customer: 'Books Customer' },
    user: { can_import: ['Books Customer'], can_create: [] },
  };
  assert.deepEqual(getImportableSchemaNames(fyo), []);
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

test('the sidebar shows only the lists, reports and groups the user can open', () => {
  const lists = [
    'Quotation',
    'SalesInvoice',
    'Customer',
    'Supplier',
    'Item',
    'Account',
  ];
  fyo.store.permissions = {
    doctypes: Object.fromEntries(lists.map((name) => [name, `Books ${name}`])),
    user: {
      can_read: ['Books Quotation', 'Books Customer', 'Books Supplier'],
    },
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
      route: '/list/Quotation',
      items: ['Quotation', 'Customer'],
    },
    { label: 'Purchases', route: '/list/Supplier', items: ['Supplier'] },
    {
      label: 'Reports',
      route: '/report/TrialBalance',
      items: ['Trial Balance'],
    },
  ]);
});

test('Setup lists Number Series for a user who can read them', () => {
  const setupItems = (canRead) => {
    fyo.store.permissions = {
      doctypes: {
        NumberSeries: 'Books Number Series',
        SystemSettings: 'Books System Settings',
      },
      user: {
        can_read: canRead ? ['Books Number Series'] : [],
        can_write: ['Books System Settings'],
      },
    };
    const setup = getSidebarConfig().find(({ label }) => label === 'Setup');
    return setup.items.map(({ label }) => label);
  };

  assert.ok(setupItems(true).includes('Number Series'));
  assert.ok(!setupItems(false).includes('Number Series'));
});

test('Setup lists the taxes and charges templates the user can read', () => {
  fyo.store.permissions = {
    doctypes: {
      SalesTaxesAndChargesTemplate: 'Books Sales Taxes and Charges Template',
      PurchaseTaxesAndChargesTemplate:
        'Books Purchase Taxes and Charges Template',
      SystemSettings: 'Books System Settings',
    },
    user: {
      can_read: ['Books Sales Taxes and Charges Template'],
      can_write: ['Books System Settings'],
    },
  };
  const setup = getSidebarConfig().find(({ label }) => label === 'Setup');
  const labels = setup.items.map(({ label }) => label);

  assert.ok(labels.includes('Sales Taxes and Charges Template'));
  assert.ok(!labels.includes('Purchase Taxes and Charges Template'));
});

test('the search palette offers only the lists and reports the user can open', () => {
  const lists = ['Quotation', 'SalesInvoice', 'Customer', 'Item', 'Account'];
  fyo.store.permissions = {
    doctypes: Object.fromEntries(lists.map((name) => [name, `Books ${name}`])),
    user: { can_read: ['Books Quotation', 'Books Customer'] },
  };
  window.frappe.boot.allowed_reports = { 'Books Trial Balance': {} };

  const routes = new Search(fyo)._nonDocSearchList
    .filter(({ group }) => group === 'List' || group === 'Report')
    .map(({ route }) => decodeURI(route).split('?')[0]);

  delete window.frappe.boot.allowed_reports;
  assert.ok(routes.includes('/list/Quotation'));
  assert.ok(routes.includes('/list/Customer'));
  assert.ok(routes.includes('/report/TrialBalance'));
  assert.ok(!routes.includes('/list/SalesInvoice'));
  assert.ok(!routes.some((route) => route.startsWith('/list/Item')));
  assert.ok(!routes.includes('/report/GeneralLedger'));
});

/** The labels of the model's actions shown on the document. */
function shownActions(schemaName, doc) {
  return getModel(schemaName)
    .getActions(fyo)
    .filter(({ condition }) => condition?.(doc) ?? true)
    .map(({ label }) => label);
}

test('a customer or supplier offers only the invoices the user may make and read', () => {
  fyo.store.permissions = {
    doctypes: {
      SalesInvoice: 'Books Sales Invoice',
      PurchaseInvoice: 'Books Purchase Invoice',
    },
    user: {
      can_read: ['Books Sales Invoice'],
      can_create: ['Books Sales Invoice'],
    },
  };
  window.frappe.boot.allowed_reports = {};

  const party = { inserted: true, notInserted: false };
  const customerActions = shownActions('Customer', party);
  const supplierActions = shownActions('Supplier', party);

  delete window.frappe.boot.allowed_reports;
  assert.deepEqual(customerActions, ['Create sale', 'View sales']);
  assert.deepEqual(supplierActions, []);
});

test('a submitted document links only to the ledgers the user may open', () => {
  fyo.store.permissions = null;
  window.frappe.boot.allowed_reports = { 'Books Stock Ledger': {} };

  const actions = shownActions('StockEntry', { isSubmitted: true });

  delete window.frappe.boot.allowed_reports;
  assert.deepEqual(actions, ['Stock entries']);
});

test("a row's field levels follow its parent's permissions", async () => {
  const findField = (fields, name) =>
    fields.find(({ fieldname }) => fieldname === name);
  window.frappe.boot.user.roles = ['Books User'];

  try {
    await loadFrappeModels();
    const invoice = getDocType('SalesInvoice');
    for (const field of [
      findField(invoice.schema.fields, 'debit_to'),
      findField(invoice.tables.items.schema.fields, 'income_account'),
    ]) {
      assert.equal(field.hidden, true);
      assert.equal(field.required, undefined);
    }
  } finally {
    window.frappe.boot.user.roles = ['Books Manager'];
    await loadFrappeModels();
  }
});

test('the palette offers the Setup pages only to users who can use them', () => {
  fyo.store.permissions = {
    doctypes: {
      Account: 'Books Account',
      AccountingSettings: 'Books Accounting Settings',
    },
    user: { can_read: [] },
  };

  const pages = new Search(fyo)._nonDocSearchList
    .filter(({ group }) => group === 'Page')
    .map(({ label }) => label);

  assert.ok(pages.includes('Dashboard'));
  assert.ok(!pages.includes('Settings'));
  assert.ok(!pages.includes('Chart of Accounts'));
});
