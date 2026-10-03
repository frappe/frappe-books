import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POS } from './helpers/frappe.mjs';

/** A POS whose shortcuts are set, with the price list dialog open. */
function getPOS() {
  const shortcuts = {};
  const group = (prefix) => ({
    set: (_context, [key], callback) =>
      (shortcuts[`${prefix}+${key}`] = callback),
  });
  const pos = {
    ...POS.methods,
    shortcuts: { shift: group('shift'), pmodShift: group('pmodShift') },
    sinvDoc: { party: 'Walk-in', items: [{ item: 'Pen' }], isSubmitted: false },
    openPriceListModal: true,
    calls: [],
    saveOrder: async () => pos.calls.push('save'),
    clearValues: async () => pos.calls.push('clear'),
  };
  pos.setShortcuts();
  return { pos, press: (key) => shortcuts[`pmodShift+${key}`]() };
}

test('saving with a dialog open leaves the dialog open and saves nothing', async () => {
  const { pos, press } = getPOS();

  await press('KeyS');

  assert.equal(pos.openPriceListModal, true);
  assert.deepEqual(pos.calls, []);
});

test('cancelling closes an open dialog, else clears the cart', async () => {
  const { pos, press } = getPOS();

  await press('Backspace');
  assert.equal(pos.openPriceListModal, false);
  assert.deepEqual(pos.calls, []);

  await press('Backspace');
  assert.deepEqual(pos.calls, ['clear']);
});
