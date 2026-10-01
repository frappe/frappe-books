import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkOnSave } from './helpers/accounting.mjs';

test('a new linked record updates the parent it was created from', async () => {
  let onSave;
  const child = {
    name: 'New Child',
    once: (_event, callback) => {
      onSave = callback;
    },
  };
  const assignments = [];
  const parent = {
    set: async (field, value) => assignments.push([field, value]),
  };
  const linked = [];

  linkOnSave(child, parent, 'party', (name) => linked.push(name));
  await onSave();
  assert.deepEqual(assignments, [['party', 'New Child']]);
  assert.deepEqual(linked, ['New Child']);
});
