import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLayout, loadFrappeModels } from './helpers/frappeModels.mjs';
import { frappeModels, fyo, getSchema, pos } from './helpers/frappe.mjs';

const profile = {
  name: 'Counter 1',
  pos_ui: 'Modern',
  item_visibility: 'Non-Inventory Items',
  can_change_rate: 1,
  can_edit_discount: 0,
};
const requests = await loadFrappeModels(frappeModels, ({ path }) =>
  path.endsWith('/Books Pos Profile/Counter 1')
    ? { data: profile }
    : { data: [] }
);

test('the POS profile form shows the fields and quick edit fields it showed', () => {
  assert.deepEqual(getLayout('POSProfile').slice(0, 4), [
    'name | Profile |  | Default',
    'pos_customer | POS Customer |  | Default',
    'inventory | Inventory |  | Default',
    'pos_print_template | POS Print Template |  | Default',
  ]);
  assert.equal(getLayout('POSProfile').at(-1).split(' | ')[3], 'Colour');
  assert.deepEqual(getSchema('POSProfile').quickEditFields, [
    'name',
    'pos_customer',
    'inventory',
    'pos_print_template',
    'pos_ui',
    'item_visibility',
    'can_change_rate',
    'hide_unavailable_items',
    'can_edit_discount',
    'ignore_pricing_rule',
  ]);
});

test('the POS reads what its profile allows and lists, else POS Settings', async () => {
  fyo.singles.POSSettings = {
    can_change_rate: false,
    can_edit_discount: true,
    item_visibility: 'Inventory Items',
  };
  assert.deepEqual(await pos.getPOSPermissions(), {
    canChangeRate: false,
    canEditDiscount: true,
  });
  assert.equal(await pos.getItemVisibility(), 'Inventory Items');
  assert.equal(requests.length, 0);

  fyo.singles.POSSettings.pos_profile = 'Counter 1';
  assert.deepEqual(await pos.getPOSPermissions(), {
    canChangeRate: true,
    canEditDiscount: false,
  });
  assert.equal(await pos.getItemVisibility(), 'Non-Inventory Items');
  assert.equal((await pos.getPOSProfile()).pos_ui, 'Modern');
});
