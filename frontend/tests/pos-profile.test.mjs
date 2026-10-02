import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLayout, loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  pos,
  posSetup,
} from './helpers/frappe.mjs';

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
  assert.equal(
    getLayout('POSProfile').at(-1),
    'pay_button_colour | Pay Button Colour | Select Colour | Colour'
  );
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
  assert.deepEqual(await posSetup.getPOSPermissions(), {
    canChangeRate: false,
    canEditDiscount: true,
  });
  assert.equal(await posSetup.getItemVisibility(), 'Inventory Items');
  assert.equal(requests.length, 0);

  fyo.singles.POSSettings.pos_profile = 'Counter 1';
  assert.deepEqual(await posSetup.getPOSPermissions(), {
    canChangeRate: true,
    canEditDiscount: false,
  });
  assert.equal(await posSetup.getItemVisibility(), 'Non-Inventory Items');
  assert.equal((await posSetup.getPOSProfile()).pos_ui, 'Modern');
});

test('All Items lists stock and service items, hiding only stock that is out', () => {
  assert.deepEqual(pos.getPOSItemFilters('All Items', 'Drinks'), [
    ['item_group', '=', 'Drinks'],
  ]);

  const items = [
    { name: 'Tea', track_item: 1 },
    { name: 'Coffee', track_item: 1 },
    { name: 'Gift Wrapping', track_item: 0 },
  ];
  const quantities = { Tea: { availableQty: 3 } };
  const listed = (hideUnavailable) =>
    pos
      .getListedPOSItems(items, quantities, hideUnavailable)
      .map(({ name }) => name);
  assert.deepEqual(listed(false), ['Tea', 'Coffee', 'Gift Wrapping']);
  assert.deepEqual(listed(true), ['Tea', 'Gift Wrapping']);
});
