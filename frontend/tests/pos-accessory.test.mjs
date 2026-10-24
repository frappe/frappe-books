import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fyo, pos, posShift } from './helpers/frappe.mjs';

function setAccessoryMode(on) {
  globalThis.window = {
    location: { hostname: 'books.localhost' },
    frappe: { boot: { books: { accessory_mode: on } } },
  };
}

afterEach(() => {
  delete globalThis.window;
});

test("accessory POS pickers list the shift profile's invoices", () => {
  const sale = { pos_profile: 'Main Counter' };
  assert.deepEqual(pos.getProfileFilters(sale), []);

  setAccessoryMode(true);
  assert.deepEqual(pos.getProfileFilters(sale), [
    ['pos_profile', '=', 'Main Counter'],
  ]);
  // ERPNext checks what is left to return itself.
  assert.deepEqual(pos.getReturnableFilters(), [
    ['docstatus', '=', 1],
    ['is_return', '=', 0],
  ]);
});

test('an ERPNext item group lists the items of its subgroups too', () => {
  setAccessoryMode(true);
  assert.deepEqual(pos.getPOSItemFilters('Inventory Items', 'Products'), [
    ['is_stock_item', '=', 1],
    ['item_group', 'descendants of (inclusive)', 'Products'],
  ]);
});

test('the cash counter counts notes that only their total is saved of', () => {
  const rows = posShift.getCashCounter([fyo.pesa(500), fyo.pesa(100)]);
  rows[0].set('count', 2);
  rows[1].set('count', 3);

  assert.deepEqual(
    rows.map(({ denomination, count }) => [denomination.float, count]),
    [
      [500, 2],
      [100, 3],
    ]
  );
});
