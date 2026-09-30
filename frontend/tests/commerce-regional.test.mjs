import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
  frappeModels,
  getRegionalFrappeModels,
  getSchema,
  newFrappeDoc,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';

await loadFrappeModels({
  ...frappeModels,
  ...(await getRegionalFrappeModels('in')),
});

const hidden = (doc, fieldname) => evaluateHidden(doc.fieldMap[fieldname], doc);

test('an Indian address shows its place of supply, in quick edit too', () => {
  const address = newFrappeDoc('Address', { country: 'India' });
  assert.equal(hidden(address, 'pos'), false);
  assert.deepEqual(getSchema('Address').quickEditFields, [
    'address_line1',
    'address_line2',
    'city',
    'country',
    'state',
    'postal_code',
    'pos',
  ]);
});
