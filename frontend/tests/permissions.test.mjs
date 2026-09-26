import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPermission } from '../fyo/utils/permissions.ts';

test('permissions come from the boot map', () => {
  const permissions = { SalesInvoice: ['read', 'create', 'submit'], Tax: ['read'] };
  assert.equal(hasPermission(permissions, 'SalesInvoice', 'submit'), true);
  assert.equal(hasPermission(permissions, 'SalesInvoice', 'cancel'), false);
  assert.equal(hasPermission(permissions, 'Tax', 'write'), false);
  assert.equal(hasPermission(permissions, 'Party', 'read'), false);
});

test('without a boot map nothing is restricted', () => {
  assert.equal(hasPermission(null, 'Tax', 'delete'), true);
});
