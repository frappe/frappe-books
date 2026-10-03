import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import { stubFrappe } from './helpers/frappe.mjs';
import {
  frappeModels,
  getActionsForDoc,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
} from './helpers/ui.mjs';

stubFrappe(({ body }) => ({ message: getBooksMeta(body.doctypes) }));
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

test('a party links to its General Ledger only once saved', async () => {
  const party = newFrappeDoc('Party', { name: 'Acme', role: 'Customer' });
  const ledger = () =>
    getActionsForDoc(party).find(({ label }) => label === 'General Ledger');

  assert.equal(ledger(), undefined);
  party._notInserted = false;
  const routes = [];
  await ledger().action(party, { push: (route) => routes.push(route) });
  assert.deepEqual(routes, [
    {
      path: '/report/GeneralLedger',
      query: { defaultFilters: '{"party":"Acme"}' },
    },
  ]);
});
