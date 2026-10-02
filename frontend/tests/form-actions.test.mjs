import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getActionsForDoc } from './helpers/ui.mjs';

test('a party links to its General Ledger only once saved', () => {
  class Party {
    static getActions() {
      return [];
    }
  }
  const party = (inserted) =>
    Object.assign(new Party(), {
      name: 'Acme',
      schemaName: 'Party',
      schema: {},
      inserted,
      notInserted: !inserted,
    });
  const labels = (doc) => getActionsForDoc(doc).map(({ label }) => label);

  assert.ok(!labels(party(false)).includes('General Ledger'));
  assert.ok(labels(party(true)).includes('General Ledger'));
});
