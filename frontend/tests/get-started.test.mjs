import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTaskChecks } from './helpers/accounting.mjs';

test('a purchase invoice completes the bill task', async () => {
  const counts = { PurchaseInvoice: 1 };
  const fyo = {
    singles: { GetStarted: { customerCreated: true } },
    db: { count: async (schemaName) => counts[schemaName] ?? 0 },
  };
  const checks = await getTaskChecks(fyo);
  assert.equal(checks.billCreated, true);
  assert.equal(checks.invoiceCreated, false);
  assert.equal(Object.hasOwn(checks, 'customerCreated'), false);
});
