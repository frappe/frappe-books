import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a party leaves its default account and currency to the server', async () => {
  const fyo = await makeFyo();
  fyo.db.exists = async () => true;
  const party = fyo.doc.getNewDoc('Party', {
    name: 'Acme',
    role: 'Customer',
    defaultAccount: 'Debtors',
  });

  await party.set('role', 'Supplier');

  assert.equal(party.defaultAccount, undefined);
  assert.ok(!party.currency);
});
