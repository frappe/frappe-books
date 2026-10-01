import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import { frappeModels, pos, posStock } from './helpers/frappe.mjs';

const item = 'Demo - Coffee Beans';
const service = 'Demo - Gift Wrapping';
const flour = 'Demo - Flour';
const tea = 'Demo - Tea';
const batch = 'DEMO-COFFEE-2026';
const inventory = 'POS Counter';

const items = {
  [item]: { track_item: 1, has_batch: 1, unit: 'Unit' },
  [service]: { track_item: 0, has_batch: 0, unit: 'Unit' },
  [tea]: { track_item: 1, has_batch: 0, unit: 'Unit' },
  [flour]: {
    track_item: 1,
    has_batch: 1,
    has_serial_number: 1,
    unit: 'Kg',
    uom_conversions: [{ uom: 'Box' }, { uom: 'Kg' }],
  },
};
const ledger = [
  { location: inventory, quantity: 4 },
  { location: 'Warehouse', quantity: 128 },
].map((row) => ({ item, batch, ...row }));

let server;
stubServer();
await loadFrappeModels(frappeModels, (request) => server(request));
beforeEach(() => stubServer());

/**
 * Answers the item and stock availability requests from the ledger, with
 * `location` as where POS sales ship from.
 */
function stubServer({ location = inventory, stock = ledger } = {}) {
  const requests = [];
  const methods = {
    get_stock_location: () => location,
    get_list: ({ doctype, filters }) =>
      doctype === 'Books Stock Ledger Entry' ? getSums(stock, filters) : [],
    get_sale_shortfalls: (args) => getShortfalls(args.items, stock, location),
  };
  server = async ({ path, body }) => {
    requests.push([path.split('/').pop(), body]);
    const name = decodeURIComponent(path.split('/Books Item/')[1] ?? '');
    if (name) {
      return { data: { name, ...items[name] } };
    }

    const method = methods[path.split('.').pop()];
    return method ? { message: await method(body) } : { data: [] };
  };
  return requests;
}

test('the card and batch quantities use the location the server ships POS sales from', async () => {
  const requests = stubServer();
  assert.equal(await posStock.getPOSInventory(), inventory);
  const quantities = await posStock.getItemQtyMap();
  assert.equal(quantities[item].availableQty, 4);
  assert.equal(quantities[item][batch], 4);
  assert.equal(await posStock.getPOSBatchQuantity(item, batch), 4);
  assert.deepEqual(requests[0], [
    'frappe_books.inventory.availability.get_stock_location',
    { doctype: 'Books Sales Invoice', is_pos: true },
  ]);
});

test('stock sums come from the ledger through frappe.client.get_list', async () => {
  const requests = stubServer();
  await posStock.getItemQtyMap([item]);
  assert.deepEqual(requests[1], [
    'frappe.client.get_list',
    {
      doctype: 'Books Stock Ledger Entry',
      fields: ['item', 'batch', { SUM: 'quantity', as: 'quantity' }],
      filters: [
        ['location', '=', inventory],
        ['item', 'in', [item]],
      ],
      group_by: 'item, batch',
      order_by: 'item, batch',
      limit_page_length: 0,
    },
  ]);
});

test('checkout asks the server for the whole sale’s shortfalls in one request', async () => {
  const requests = stubServer();
  const invoice = { items: [{ item, batch, quantity: 2 }] };
  await pos.validateSinv(invoice);
  assert.deepEqual(requests, [
    [
      'frappe_books.inventory.availability.get_sale_shortfalls',
      { items: [{ item, batch, quantity: 2 }], is_pos: true },
    ],
  ]);
});

test('checkout accepts stocked batches and rejects stock held elsewhere', async () => {
  const invoice = { items: [{ item, batch, quantity: 2 }] };
  await pos.validateSinv(invoice);

  stubServer({ location: 'Empty Counter' });
  await assert.rejects(
    pos.validateSinv(invoice),
    /Demo - Coffee Beans in Empty Counter.*Available: 0; required: 2/
  );
});

test('checkout checks the selected batch instead of just total item stock', async () => {
  stubServer({
    stock: [
      { item, batch, location: inventory, quantity: 1 },
      { item, batch: 'DEMO-COFFEE-2027', location: inventory, quantity: 131 },
    ],
  });
  const invoice = { items: [{ item, batch, quantity: 2 }] };
  await assert.rejects(
    pos.validateSinv(invoice),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 1; required: 2/
  );
});

test('checkout combines repeated item rows, including free items', async () => {
  const invoice = {
    items: [
      { item, batch, quantity: 3 },
      { item, batch, quantity: 2, is_free_item: true },
    ],
  };
  await assert.rejects(
    pos.validateSinv(invoice),
    /batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
});

test('an item the POS location has none of is out of stock, the error the server gives first', async () => {
  const invoice = {
    items: [
      { item, batch, quantity: 5 },
      { item: tea, quantity: 1 },
    ],
  };
  await assert.rejects(
    pos.validateSinv(invoice),
    /^ValidationError: Item Demo - Tea is out of stock \(quantity is zero\)$/
  );
});

test('checkout needs no stock of untracked items', async () => {
  const invoice = {
    items: [
      { item: service, quantity: 99 },
      { item, batch, quantity: 2 },
    ],
  };
  await pos.validateSinv(invoice);
});

test('fractional sales and returns do not produce false stock errors', async () => {
  const invoice = { items: [{ item, batch, quantity: 0.5 }] };
  await pos.validateSinv(invoice);
  invoice.return_against = 'Original Invoice';
  invoice.items[0].quantity = -2;
  const requests = stubServer({ stock: [] });
  await pos.validateSinv(invoice);
  assert.deepEqual(requests, []);
});

test('a row may not ask for more of its batch than the POS warehouse has', async () => {
  const rows = [
    { item, batch, quantity: 3 },
    { item, batch, quantity: 1 },
  ];
  await pos.validateQty(rows[0], rows);
  rows[1].quantity = 2;
  await assert.rejects(
    pos.validateQty(rows[0], rows),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
});

test('a batched row needs a batch and untracked items need no stock', async () => {
  const row = { item, quantity: 999 };
  await assert.rejects(pos.validateQty(row, [row]), /select a batch/);
  const untracked = { item: service, quantity: 999 };
  await pos.validateQty(untracked, [untracked]);
});

test('a row without a batch shows no batch stock', async () => {
  assert.equal(await posStock.getPOSBatchQuantity(item, batch), 4);
  assert.equal(await posStock.getPOSBatchQuantity(item, undefined), 0);
});

test('selecting an unavailable batch cannot use stock from other warehouses', async () => {
  stubServer({ stock: ledger.filter((row) => row.location !== inventory) });
  const invoice = makeInvoice();
  await assert.rejects(
    pos.addBatchItem(invoice, product, batch, 2),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 0/
  );
  assert.equal(invoice.items.length, 0);
});

test('selecting a stocked batch adds to its row and checks the added quantity', async () => {
  const invoice = makeInvoice();
  await pos.addBatchItem(invoice, product, batch, 2);
  assert.equal(invoice.items[0].quantity, 2);

  await assert.rejects(
    pos.addBatchItem(invoice, product, batch, 3),
    /Available: 4; required: 5/
  );
  assert.equal(invoice.items[0].quantity, 2);
});

test('checkout validates against the stock the server has now', async () => {
  const invoice = { items: [{ item, batch, quantity: 2 }] };
  await pos.validatePOSCheckout(invoice);
  stubServer({ stock: [{ item, batch, location: inventory, quantity: 1 }] });
  await assert.rejects(
    pos.validatePOSCheckout(invoice),
    /Available: 1; required: 2/
  );
});

test('a payment retry does not require stock that has already shipped', async () => {
  const requests = stubServer();
  const invoice = { isSubmitted: true, items: [{ item, batch, quantity: 2 }] };
  await pos.validatePOSCheckout(invoice);
  assert.deepEqual(requests, []);
});

test('a cart quantity must be above zero unless the row is a return', async () => {
  const row = makeRow({ quantity: 2, transfer_quantity: 2 });
  for (const quantity of [0, -1]) {
    await assert.rejects(
      pos.setPOSRowQuantity(row, 'quantity', quantity),
      /greater than zero/
    );
  }
  assert.equal(row.quantity, 2);

  const returned = makeRow({
    isReturn: true,
    quantity: -1,
    transfer_quantity: -1,
  });
  await pos.setPOSRowQuantity(returned, 'transfer_quantity', 3);
  assert.deepEqual([returned.quantity, returned.transfer_quantity], [-3, -3]);
});

test('a cart quantity the POS warehouse cannot supply is restored', async () => {
  const row = makeRow({ quantity: 2, transfer_quantity: 2 });
  await assert.rejects(
    pos.setPOSRowQuantity(row, 'transfer_quantity', 5),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
  assert.deepEqual([row.quantity, row.transfer_quantity], [2, 2]);

  await pos.setPOSRowQuantity(row, 'quantity', 4);
  assert.equal(row.quantity, 4);
});

test('a transfer quantity is checked by the stock quantity it converts to', async () => {
  const row = makeRow({ unit_conversion_factor: 2 });
  await pos.setPOSRowQuantity(row, 'transfer_quantity', 2);
  assert.deepEqual([row.transfer_quantity, row.quantity], [2, 4]);
  await assert.rejects(
    pos.setPOSRowQuantity(row, 'transfer_quantity', 3),
    /Available: 4; required: 6/
  );
  assert.deepEqual([row.transfer_quantity, row.quantity], [2, 4]);
});

test('a cart discount edit picks amount or percent discounts', async () => {
  const row = makeRow();
  await pos.setPOSRowValue(row, 'item_discount_amount', 5);
  assert.equal(row.set_item_discount_amount, true);
  await pos.setPOSRowValue(row, 'item_discount_percent', 10);
  assert.deepEqual(
    [row.set_item_discount_amount, row.item_discount_percent],
    [false, 10]
  );
  await pos.setPOSRowValue(row, 'transfer_rate', 7);
  assert.deepEqual(
    [row.set_item_discount_amount, row.transfer_rate],
    [false, 7]
  );
});

test('adding an item already in the cart checks the POS warehouse for the new total', async () => {
  const row = makeRow({ quantity: 3, transfer_quantity: 3 });
  const invoice = row.parentdoc;
  const stock = { [item]: { availableQty: 4 } };
  assert.equal(await pos.addPOSItem(invoice, product, 1, stock), row);
  assert.equal(row.quantity, 4);
  await assert.rejects(
    pos.addPOSItem(invoice, product, 1, stock),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
  assert.equal(row.quantity, 4);
});

test('a new cart row needs the item in stock', async () => {
  const invoice = makeInvoice();
  await assert.rejects(pos.addPOSItem(invoice, product, 1, {}), /out of stock/);
  const row = await pos.addPOSItem(invoice, product, 2, stockMap(0));
  assert.deepEqual(
    [invoice.items.length, row.item, row.quantity],
    [1, item, 2]
  );
});

test('a sale row leaves serial numbers that miss its quantity to the server', () => {
  const left = [];
  const makeSerialRow = (values) => ({
    ...values,
    leaveToServer: (fieldnames) => left.push([values.quantity, fieldnames]),
  });
  pos.refillSerialNumbers(makeSerialRow({ quantity: 2, serial_number: 'S1' }));
  pos.refillSerialNumbers(makeSerialRow({ quantity: 2, serial_number: 'S1\nS2' }));
  pos.refillSerialNumbers(makeSerialRow({ quantity: -2, serial_number: 'SOLD-1' }));
  assert.deepEqual(left, [[2, ['serial_number']]]);
});

test('a cart row reads batch, serial and unit settings from its item', async () => {
  assert.deepEqual(await pos.getPOSRowItem(flour), {
    hasBatch: true,
    hasSerialNumber: true,
    units: ['Kg', 'Box'],
  });
  assert.deepEqual(await pos.getPOSRowItem(undefined), {
    hasBatch: false,
    hasSerialNumber: false,
    units: [],
  });
});

function makeRow(values = {}) {
  const invoice = { items: [] };
  const row = {
    item,
    batch,
    quantity: 1,
    transfer_quantity: 1,
    parentdoc: invoice,
    ...values,
    async set(field, value) {
      this[field] = value;
    },
  };
  invoice.items.push(row);
  return row;
}

const product = {
  name: item,
  rate: 600,
  unit: 'Unit',
  trackItem: true,
  hasBatch: true,
};

function makeInvoice() {
  return {
    items: [],
    async append(_field, row) {
      this.items.push({
        ...row,
        async set(field, value) {
          this[field] = value;
        },
      });
    },
  };
}

/** The ledger rows that match the location and item filters, as their sums. */
function getSums(stock, filters) {
  const values = Object.fromEntries(filters.map(([field, , value]) => [field, value]));
  return stock
    .filter((row) => !values.location || row.location === values.location)
    .filter((row) => !values.item || values.item.includes(row.item))
    .map(({ item, batch, quantity }) => ({ item, batch, quantity }));
}

/** What the rows lack of each tracked item, or batch, at the location, as the server sums them. */
function getShortfalls(rows, stock, location) {
  const required = new Map();
  for (const row of rows.filter((row) => items[row.item]?.track_item)) {
    const key = JSON.stringify([row.item, row.batch ?? '']);
    required.set(key, (required.get(key) ?? 0) + row.quantity);
  }

  return [...required].flatMap(([key, quantity]) => {
    const [item, batch] = JSON.parse(key);
    const available = stock
      .filter((row) => row.location === location && row.item === item)
      .filter((row) => !batch || row.batch === batch)
      .reduce((total, row) => total + row.quantity, 0);
    return quantity > available
      ? [{ item, batch: batch || null, quantity: quantity - available }]
      : [];
  });
}

function stockMap(batchQuantity) {
  return {
    [item]: { availableQty: batchQuantity + 10, [batch]: batchQuantity },
  };
}
