import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import { frappeModels, fyo, newFrappeDoc, posCart } from './helpers/frappe.mjs';

const tea = 'Demo - Tea';
const flour = 'Demo - Flour';
const coffee = 'Demo - Coffee Beans';
const rice = 'Demo - Rice';
const service = 'Demo - Gift Wrapping';
const batch = 'DEMO-COFFEE-2026';
const items = {
  [tea]: { is_stock_item: 1, stock_uom: 'Unit' },
  [flour]: { is_stock_item: 1, has_serial_no: 1, stock_uom: 'Kg' },
  [coffee]: { is_stock_item: 1, has_batch_no: 1, stock_uom: 'Unit' },
  [rice]: { is_stock_item: 1, stock_uom: 'Kg' },
  [service]: { is_stock_item: 0, stock_uom: 'Unit' },
};

/** What the POS location has, by item or by `item|batch`. */
let stock = {};
const sales = [];
const requests = await loadFrappeModels(frappeModels, ({ path, body }) => {
  const name = decodeURIComponent(path.split('/Books Item/')[1] ?? '');
  if (name) {
    return { data: { name, ...items[name] } };
  }

  if (path.endsWith('.get_stock_location')) {
    return { message: 'POS Counter' };
  }

  if (path.endsWith('.get_sale_shortfalls')) {
    return { message: getShortfalls(body.items) };
  }

  return { data: [] };
});
afterEach(() => sales.forEach((sale) => clearTimeout(sale._previewTimer)));

test('a card tap and a stepper add the unit the cart shows', async () => {
  stock = { [tea]: 100 };
  setUOMConversions(true);
  const sale = makeSale([
    {
      item_code: tea,
      stock_uom: 'Unit',
      uom: 'Box',
      conversion_factor: 12,
      qty: 1,
      stock_qty: 12,
    },
  ]);
  const [row] = sale.items;
  await posCart.addToCart(sale, { name: tea }, 1);
  await posCart.stepCartQuantity(row, 1);
  assert.deepEqual([row.qty, row.stock_qty], [3, 36]);
  assert.equal(posCart.getCartRowQuantity(row), 3);

  setUOMConversions(false);
  const plain = makeSale([{ item_code: tea, stock_qty: 1 }]);
  await posCart.addToCart(plain, { name: tea }, 1);
  await posCart.stepCartQuantity(plain.items[0], 1);
  assert.equal(plain.items[0].stock_qty, 3);
});

test('a scale quantity is in the stock unit, whatever unit its row shows', async () => {
  stock = { [rice]: 10 };
  setUOMConversions(true);
  const sale = makeSale([
    {
      item_code: rice,
      stock_uom: 'Kg',
      uom: 'Gram',
      conversion_factor: 0.001,
      qty: 250,
      stock_qty: 0.25,
    },
  ]);
  const [row] = sale.items;
  await posCart.addToCart(sale, { name: rice }, 0.5, { isStockQuantity: true });
  assert.deepEqual([row.qty, row.stock_qty], [750, 0.75]);

  setUOMConversions(false);
  await posCart.addToCart(sale, { name: rice }, 0.5, { isStockQuantity: true });
  assert.equal(row.stock_qty, 1.25);
});

test('every quantity change leaves serial numbers that no longer match to the server', async () => {
  stock = { [flour]: 10 };
  setUOMConversions(false);
  const changes = [
    (row) => posCart.addToCart(row.parentdoc, { name: flour }, 1),
    (row) => posCart.stepCartQuantity(row, 1),
    (row) => posCart.setCartQuantity(row, 3),
    (row) => posCart.setPOSRowValue(row, 'stock_qty', 3),
    (row) => posCart.setCartUnit(row, 'Kg'),
  ];
  for (const change of changes) {
    const sale = makeSale([
      { item_code: flour, stock_uom: 'Kg', stock_qty: 2, serial_no: 'S1\nS2' },
    ]);
    await change(sale.items[0]);
    assert.equal('serial_no' in getSentRow(sale), false, String(change));
  }

  const matching = makeSale([
    { item_code: flour, stock_qty: 1, serial_no: 'S1\nS2' },
  ]);
  await posCart.setCartQuantity(matching.items[0], 2);
  assert.equal(getSentRow(matching).serial_no, 'S1\nS2');

  const returned = makeSale(
    [{ item_code: flour, stock_qty: -2, serial_no: 'SOLD-1\nSOLD-2' }],
    { return_against: 'SINV-1001' }
  );
  await posCart.stepCartQuantity(returned.items[0], -1);
  assert.equal(returned.items[0].stock_qty, -1);
  assert.equal(getSentRow(returned).serial_no, 'SOLD-1\nSOLD-2');
});

test('a batch add merges into its row and restores it when the POS location cannot supply it', async () => {
  stock = { [`${coffee}|${batch}`]: 4 };
  setUOMConversions(false);
  const sale = makeSale();
  await assert.rejects(
    posCart.addToCart(sale, { name: coffee }, 1),
    /select a batch/
  );
  await posCart.addToCart(sale, { name: coffee }, 2, { batch });
  await posCart.addToCart(sale, { name: coffee }, 1, { batch });
  assert.deepEqual(
    sale.items.map((row) => [row.batch_no, row.stock_qty]),
    [[batch, 3]]
  );

  await assert.rejects(
    posCart.addToCart(sale, { name: coffee }, 2, { batch }),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
  assert.equal(sale.items[0].stock_qty, 3);

  stock = {};
  const empty = makeSale();
  await assert.rejects(
    posCart.addToCart(empty, { name: coffee }, 1, { batch }),
    /Available: 0; required: 1/
  );
  assert.equal(empty.items.length, 0);
});

test('a cart quantity is checked by the stock quantity it converts to, and restored when refused', async () => {
  stock = { [tea]: 4 };
  setUOMConversions(true);
  const sale = makeSale([
    {
      item_code: tea,
      uom: 'Box',
      conversion_factor: 2,
      qty: 1,
      stock_qty: 2,
    },
  ]);
  const [row] = sale.items;
  await posCart.setCartQuantity(row, 2);
  assert.deepEqual([row.qty, row.stock_qty], [2, 4]);

  await assert.rejects(
    posCart.addToCart(sale, { name: tea }, 1),
    /Demo - Tea in POS Counter. Available: 4; required: 6/
  );
  assert.deepEqual([row.qty, row.stock_qty], [2, 4]);
});

test('a cart quantity must be above zero, and a return takes it back', async () => {
  stock = { [tea]: 10 };
  setUOMConversions(false);
  const [row] = makeSale([{ item_code: tea, stock_qty: 1 }]).items;
  for (const change of [
    () => posCart.setCartQuantity(row, 0),
    () => posCart.setCartQuantity(row, -1),
  ]) {
    await assert.rejects(change(), /greater than zero/);
  }
  await posCart.stepCartQuantity(row, -1);
  assert.equal(row.stock_qty, 1);

  const [returned] = makeSale([{ item_code: tea, stock_qty: -1 }], {
    return_against: 'SINV-1001',
  }).items;
  await posCart.setCartQuantity(returned, 3);
  await posCart.stepCartQuantity(returned, 1);
  assert.deepEqual(
    [returned.stock_qty, posCart.getCartRowQuantity(returned)],
    [-4, 4]
  );
});

test('a new cart row needs its item in stock and leaves its price to the server', async () => {
  stock = {};
  setUOMConversions(true);
  const sale = makeSale();
  await assert.rejects(
    posCart.addToCart(sale, { name: tea }, 1),
    /^ValidationError: Item Demo - Tea is out of stock/
  );
  assert.equal(sale.items.length, 0);

  requests.length = 0;
  await posCart.addToCart(sale, { name: service }, 2);
  const shortfalls = requests.filter(({ path }) =>
    path.endsWith('.get_sale_shortfalls')
  );
  assert.deepEqual(shortfalls, []);
  const sent = getSentRow(sale);
  assert.deepEqual([sent.item_code, sent.qty], [service, 2]);
  for (const fieldname of ['price_list_rate', 'stock_qty', 'stock_uom']) {
    assert.equal(fieldname in sent, false, fieldname);
  }
});

test('the item badge and the cart total count what the cart shows', () => {
  setUOMConversions(true);
  const sale = makeSale([
    {
      item_code: tea,
      uom: 'Box',
      conversion_factor: 12,
      qty: 2,
      stock_qty: 24,
    },
    { item_code: tea, qty: 1, stock_qty: 1, is_free_item: true },
    { item_code: flour, qty: 0.5, stock_qty: 0.5 },
  ]);
  assert.deepEqual(posCart.getQuantityByItem(sale), { [tea]: 2, [flour]: 0.5 });
  assert.equal(posCart.getTotalQuantity(sale.items), 3.5);

  const returned = makeSale([{ item_code: tea, qty: -2, stock_qty: -2 }], {
    return_against: 'SINV-1001',
  });
  assert.equal(posCart.getTotalQuantity(returned.items), 2);
});

test('a cart row needs a serial number for each unit, blank lines aside', () => {
  const [row] = makeSale([
    { item_code: flour, stock_qty: 2, serial_no: 'S1\n' },
  ]).items;
  assert.throws(
    () => posCart.validateSerialNumberCount(row),
    /^ValidationError: Need 2 Serial Numbers for Item Demo - Flour. You have provided 1$/
  );
  row.serial_no = 'S1\nS2';
  posCart.validateSerialNumberCount(row);
});

test('a cart discount edit picks a percentage or an amount per unit', async () => {
  const [row] = makeSale([{ item_code: tea, stock_qty: 1 }]).items;
  row.discount_percentage = 10;
  await posCart.setPOSRowValue(row, 'discount_amount', fyo.pesa(5));
  assert.deepEqual(
    [row.discount_percentage, row.discount_amount.float],
    [0, 5]
  );
  await posCart.setPOSRowValue(row, 'discount_percentage', 10);
  assert.deepEqual(
    [row.discount_amount.float, row.discount_percentage],
    [0, 10]
  );
  await posCart.setPOSRowValue(row, 'price_list_rate', fyo.pesa(7));
  assert.deepEqual(
    [row.discount_percentage, row.price_list_rate.float],
    [10, 7]
  );
});

function setUOMConversions(isEnabled) {
  fyo.singles.InventorySettings = { enable_uom_conversions: isEnabled };
}

/** A new POS sale with `rows`. */
function makeSale(rows = [], values = {}) {
  const sale = newFrappeDoc('SalesInvoice', {
    is_pos: true,
    items: rows,
    ...values,
  });
  sales.push(sale);
  return sale;
}

/** The sale's first row as its next preview sends it. */
function getSentRow(sale) {
  return sale.getMethodDocument({ keepRowNames: true, clearServerFilled: true })
    .items[0];
}

/** What the rows lack of each tracked item, or batch, at the POS location. */
function getShortfalls(rows) {
  const required = {};
  for (const { item_code, batch_no, stock_qty } of rows) {
    if (items[item_code].is_stock_item) {
      const key = batch_no ? `${item_code}|${batch_no}` : item_code;
      required[key] = (required[key] ?? 0) + stock_qty;
    }
  }

  return Object.entries(required)
    .filter(([key, quantity]) => quantity > (stock[key] ?? 0))
    .map(([key, quantity]) => {
      const [item, batch = null] = key.split('|');
      return {
        item_code: item,
        batch_no: batch,
        stock_qty: quantity - (stock[key] ?? 0),
      };
    });
}
