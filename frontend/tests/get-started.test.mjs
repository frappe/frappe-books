import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMethod } from './helpers/vue-method.mjs';

test('a purchase invoice completes the bill task', async () => {
  const counts = { PurchaseInvoice: 1 };
  const fyo = {
    singles: { GetStarted: {} },
    db: { count: async (schemaName) => counts[schemaName] ?? 0 },
  };
  const checkForCompletedTasks = await loadMethod(
    'src/pages/GetStarted.vue',
    'checkForCompletedTasks',
    { fyo }
  );
  let updated;
  await checkForCompletedTasks.call({
    checkIsOnboardingComplete: async () => false,
    updateChecks: async (toUpdate) => (updated = toUpdate),
  });
  assert.equal(updated.billCreated, true);
  assert.equal(updated.invoiceCreated, false);
});
