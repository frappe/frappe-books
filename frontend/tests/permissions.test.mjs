import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportsOwnDocumentsOnly,
  hasPermission,
} from '../fyo/utils/permissions.ts';
import { getImportableSchemaNames, makeFyo } from './helpers/accounting.mjs';

const doctypes = { SalesInvoice: 'Books Sales Invoice', Tax: 'Books Tax' };

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

test('a saved document uses the rights the server returned for it', async () => {
  const fyo = await makeFyo();
  fyo.store.permissions = {
    doctypes: { Payment: 'Books Payment' },
    user: { can_write: ['Books Payment'], can_delete: ['Books Payment'] },
  };
  const payment = fyo.doc.getNewDoc('Payment', { name: 'PAY-0001' });
  payment._notInserted = false;
  assert.equal(payment.canWrite, true);
  assert.equal(payment.canDelete, true);

  payment.docPermissions = { read: 1, write: 0, delete: 0 };
  assert.equal(payment.canWrite, false);
  assert.equal(payment.canDelete, false);
});

test('printing a document needs the print permission', async () => {
  const fyo = await makeFyo();
  fyo.store.permissions = {
    doctypes: { Payment: 'Books Payment' },
    user: { can_read: ['Books Payment'] },
  };
  const payment = fyo.doc.getNewDoc('Payment', { name: 'PAY-0001' });
  payment._notInserted = false;
  assert.equal(payment.can('print'), false);

  payment.docPermissions = { read: 1, print: 1 };
  assert.equal(payment.can('print'), true);
});

test('the import wizard offers only the schemas the user may import', async () => {
  const fyo = await makeFyo();
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
