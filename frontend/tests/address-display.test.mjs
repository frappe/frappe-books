import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('an address leaves its display text to the server', async () => {
  const fyo = await makeFyo();
  const address = fyo.doc.getNewDoc('Address', { name: 'Office' });

  await address.setMultiple({
    addressLine1: '42 Market Road',
    city: 'Mumbai',
    country: 'India',
  });

  assert.ok(!address.addressDisplay);
});

test('an Indian address offers the states the server sends', async () => {
  const fyo = await makeFyo();
  fyo.store.indianStates = { 27: 'Maharashtra', '07': 'Delhi' };
  const address = fyo.doc.getNewDoc('Address', { country: 'India' });

  assert.deepEqual(fyo.models.Address.lists.state(address), [
    'Delhi',
    'Maharashtra',
  ]);
});
