import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMethod } from './helpers/vue-method.mjs';

test('report cells round with the system display precision', async () => {
  const getCellColorClass = await loadMethod(
    'src/components/Report/ListReport.vue',
    'getCellColorClass',
    {}
  );
  const page = {
    fyo: { singles: { SystemSettings: { displayPrecision: 3 } } },
  };
  assert.equal(
    getCellColorClass.call(page, { rawValue: 0.004 }),
    'text-ink-gray-9'
  );
  assert.equal(
    getCellColorClass.call(page, { rawValue: 0.0004 }),
    'text-ink-gray-6'
  );
});
