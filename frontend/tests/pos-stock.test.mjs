import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addBatchItem,
  addPOSItem,
  fillRowSerialNumbers,
  getItemQtyMap,
  validateQty,
  getPOSInventory,
  getPOSBatchQuantity,
  setPOSRowQuantity,
  setPOSRowValue,
  validateActiveSerialNumbers,
  validateSinv,
  validatePOSCheckout,
} from './helpers/accounting.mjs';

const item = 'Demo - Coffee Beans';
const batch = 'DEMO-COFFEE-2026';
const inventory = 'POS Counter';

test('the card and batch quantities use the POS profile warehouse', async () => {
  const fyo = makeFyo();
  assert.equal(await getPOSInventory(fyo), inventory);
  const quantities = await getItemQtyMap({ fyo });
  assert.equal(quantities[item].availableQty, 4);
  assert.equal(quantities[item][batch], 4);
  assert.equal(await getPOSBatchQuantity(fyo, item, batch), 4);
});

test('a profile without a warehouse falls back to POS Settings', async () => {
  const fyo = makeFyo();
  fyo.doc.getDoc = async () => ({ inventory: '' });
  assert.equal(await getPOSInventory(fyo), 'Warehouse');
  assert.equal((await getItemQtyMap({ fyo }))[item].availableQty, 128);
  assert.equal(await getPOSBatchQuantity(fyo, item, batch), 128);
});

test('checkout accepts stocked batches and rejects stock held elsewhere', async () => {
  const fyo = makeFyo();
  const invoice = { fyo, items: [{ item, batch, quantity: 2 }] };
  await validateSinv(invoice, await getItemQtyMap(invoice));

  fyo.doc.getDoc = async () => ({ inventory: 'Empty Counter' });
  await assert.rejects(
    validateSinv(invoice, await getItemQtyMap(invoice)),
    /Demo - Coffee Beans in Empty Counter.*Available: 0; required: 2/
  );
});

test('checkout checks the selected batch instead of just total item stock', async () => {
  const fyo = makeFyo();
  const invoice = { fyo, items: [{ item, batch, quantity: 2 }] };
  await assert.rejects(
    validateSinv(invoice, { [item]: { availableQty: 132, [batch]: 1 } }),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 1; required: 2/
  );
});

test('checkout combines repeated item rows, including free items', async () => {
  const fyo = makeFyo();
  const invoice = {
    fyo,
    items: [
      { item, batch, quantity: 3 },
      { item, batch, quantity: 2, isFreeItem: true },
    ],
  };
  await assert.rejects(
    validateSinv(invoice, { [item]: { availableQty: 132, [batch]: 4 } }),
    /batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
});

test('fractional sales and returns do not produce false stock errors', async () => {
  const fyo = makeFyo();
  const invoice = { fyo, items: [{ item, batch, quantity: 0.5 }] };
  await validateSinv(invoice, await getItemQtyMap(invoice));
  invoice.returnAgainst = 'Original Invoice';
  invoice.items[0].quantity = -2;
  await validateSinv(invoice, {});
});

test('a row may not ask for more of its batch than the POS warehouse has', async () => {
  const fyo = makeFyo();
  const rows = [
    { item, batch, quantity: 3 },
    { item, batch, quantity: 1 },
  ];
  await validateQty({ fyo }, rows[0], rows);
  rows[1].quantity = 2;
  await assert.rejects(
    validateQty({ fyo }, rows[0], rows),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
});

test('a batched row needs a batch and untracked items need no stock', async () => {
  const fyo = makeFyo();
  const row = { item, quantity: 999 };
  await assert.rejects(validateQty({ fyo }, row, [row]), /select a batch/);
  fyo.getValue = async () => false;
  await validateQty({ fyo }, row, [row]);
});

test('a row without a batch shows no batch stock', async () => {
  const fyo = makeFyo();
  assert.equal(await getPOSBatchQuantity(fyo, item, batch), 4);
  assert.equal(await getPOSBatchQuantity(fyo, item, undefined), 0);
});

test('selecting an unavailable batch cannot use stock from other warehouses', async () => {
  const invoice = makeInvoice();
  await assert.rejects(
    addBatchItem(invoice, product, batch, 2, stockMap(0)),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 0/
  );
  assert.equal(invoice.items.length, 0);
});

test('selecting a stocked batch adds to its row and checks the added quantity', async () => {
  const invoice = makeInvoice();
  await addBatchItem(invoice, product, batch, 2, stockMap(4));
  assert.equal(invoice.items[0].quantity, 2);

  await assert.rejects(
    addBatchItem(invoice, product, batch, 3, stockMap(4)),
    /Available: 4; required: 5/
  );
  assert.equal(invoice.items[0].quantity, 2);
});

test('checkout validates against freshly loaded stock', async () => {
  const invoice = { fyo: makeFyo(), items: [{ item, batch, quantity: 2 }] };
  await validatePOSCheckout(invoice, async () => stockMap(4), {});
  await assert.rejects(
    validatePOSCheckout(invoice, async () => stockMap(1), {}),
    /Available: 1; required: 2/
  );
});

test('a payment retry does not require stock that has already shipped', async () => {
  const invoice = {
    fyo: makeFyo(),
    isSubmitted: true,
    stockNotTransferred: false,
    items: [{ item, batch, quantity: 2 }],
  };
  await validatePOSCheckout(
    invoice,
    async () => assert.fail('Stock already shipped'),
    { [item]: 'SN-1' }
  );
});

test('a cart quantity must be above zero unless the row is a return', async () => {
  const row = makeRow({ quantity: 2, transferQuantity: 2 });
  for (const quantity of [0, -1]) {
    await assert.rejects(
      setPOSRowQuantity(row, 'quantity', quantity),
      /greater than zero/
    );
  }
  assert.equal(row.quantity, 2);

  const returned = makeRow({ isReturn: true, quantity: -1, transferQuantity: -1 });
  await setPOSRowQuantity(returned, 'transferQuantity', 3);
  assert.deepEqual([returned.quantity, returned.transferQuantity], [-3, -3]);
});

test('a cart quantity the POS warehouse cannot supply is restored', async () => {
  const row = makeRow({ quantity: 2, transferQuantity: 2 });
  await assert.rejects(
    setPOSRowQuantity(row, 'transferQuantity', 5),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
  assert.deepEqual([row.quantity, row.transferQuantity], [2, 2]);

  await setPOSRowQuantity(row, 'quantity', 4);
  assert.deepEqual([row.quantity, row.transferQuantity], [4, 4]);
});

test('a cart discount edit picks amount or percent discounts', async () => {
  const row = makeRow();
  await setPOSRowValue(row, 'itemDiscountAmount', 5);
  assert.equal(row.setItemDiscountAmount, true);
  await setPOSRowValue(row, 'itemDiscountPercent', 10);
  assert.deepEqual([row.setItemDiscountAmount, row.itemDiscountPercent], [false, 10]);
  await setPOSRowValue(row, 'rate', 7);
  assert.deepEqual([row.setItemDiscountAmount, row.rate], [false, 7]);
});

test('adding an item already in the cart checks the POS warehouse for the new total', async () => {
  const row = makeRow({ quantity: 3, transferQuantity: 3 });
  const invoice = row.parentdoc;
  invoice.fyo.doc.getDoc = async () => ({ trackItem: true, inventory });
  const stock = { [item]: { availableQty: 4 } };
  assert.equal(await addPOSItem(invoice, product, 1, stock), row);
  assert.equal(row.quantity, 4);
  await assert.rejects(
    addPOSItem(invoice, product, 1, stock),
    /POS Counter for batch DEMO-COFFEE-2026.*Available: 4; required: 5/
  );
  assert.equal(row.quantity, 4);
});

test('a new cart row needs the item in stock', async () => {
  const invoice = makeInvoice();
  await assert.rejects(addPOSItem(invoice, product, 1, {}), /out of stock/);
  const row = await addPOSItem(invoice, product, 2, stockMap(0));
  assert.deepEqual(
    [invoice.items.length, row.quantity, row.transferUnit],
    [1, 2, 'Unit']
  );
});

test('checkout checks all serial numbers in one query', async () => {
  const queries = [];
  const fyo = {
    db: {
      getAllRaw: async (_schema, { filters }) => {
        queries.push(filters);
        return [{ name: 'SN-1' }, { name: 'SN-3' }];
      },
    },
  };
  await assert.rejects(
    validateActiveSerialNumbers(fyo, { A: 'SN-1\nSN-2', B: 'SN-3\n' }),
    /Serial Number SN-2 status is not Active/
  );
  assert.deepEqual(queries, [
    { name: ['in', ['SN-1', 'SN-2', 'SN-3']], status: 'Active' },
  ]);
  await validateActiveSerialNumbers(fyo, { A: 'SN-1', B: 'SN-3' });
  await validateActiveSerialNumbers(fyo, {});
  assert.equal(queries.length, 2);
});

test('a cart row fills serial numbers for sales and keeps a return row’s', async () => {
  const requested = [];
  const fyo = makeSerialFyo(async (limit) => {
    requested.push(limit);
    return [{ name: 'SN-1' }, { name: 'SN-2' }];
  });
  const serials = {};
  const sale = makeSerialRow(fyo, { quantity: 2 });
  await fillRowSerialNumbers(sale, serials);
  assert.equal(sale.serialNumber, 'SN-1\nSN-2');
  assert.equal(serials[item], 'SN-1\nSN-2');
  await fillRowSerialNumbers(sale, serials);

  const returned = makeSerialRow(fyo, { quantity: -2, serialNumber: 'SOLD-1' });
  await fillRowSerialNumbers(returned, {});
  assert.equal(returned.serialNumber, 'SOLD-1');
  assert.deepEqual(requested, [2]);
});

test('a cart row reports serial number lookup failures', async () => {
  const fyo = makeSerialFyo(async () => {
    throw new Error('Serial numbers unavailable');
  });
  await assert.rejects(
    fillRowSerialNumbers(makeSerialRow(fyo, { quantity: 1 }), {}),
    /Serial numbers unavailable/
  );
});

function makeSerialFyo(getSerialNumbers) {
  return {
    getValue: async () => true,
    db: { getAllRaw: async (_schema, { limit }) => getSerialNumbers(limit) },
  };
}

function makeSerialRow(fyo, values) {
  return {
    fyo,
    item,
    ...values,
    async set(field, value) {
      this[field] = value;
    },
  };
}

function makeRow(values = {}) {
  const invoice = { fyo: makeFyo(), items: [] };
  const row = {
    item,
    batch,
    quantity: 1,
    transferQuantity: 1,
    parentdoc: invoice,
    ...values,
    async set(field, value) {
      this[field] = value;
      if (field === 'quantity') this.transferQuantity = value;
      if (field === 'transferQuantity') this.quantity = value;
    },
    async setMultiple(values) {
      Object.assign(this, values);
    },
  };
  invoice.items.push(row);
  return row;
}

function makeFyo() {
  const ledger = [
    { location: inventory, quantity: 4 },
    { location: 'Warehouse', quantity: 128 },
  ].map((row, index) => ({
    name: String(index + 1),
    date: '2026-09-06T09:00:00Z',
    item,
    batch,
    rate: '600',
    ...row,
  }));
  return {
    singles: {
      POSSettings: { posProfile: 'Retail', inventory: 'Warehouse' },
    },
    doc: { getDoc: async () => ({ inventory }) },
    getValue: async () => true,
    db: {
      getStockQuantities: async (location, items) =>
        ledger
          .filter((row) => !location || row.location === location)
          .filter((row) => !items || items.includes(row.item))
          .map(({ item, batch, quantity }) => ({ item, batch, quantity })),
      getStockQuantity: async (name, location, _from, _to, selectedBatch) =>
        ledger
          .filter(
            (row) =>
              row.item === name &&
              (!location || row.location === location) &&
              row.batch === selectedBatch
          )
          .reduce((total, row) => total + row.quantity, 0),
    },
  };
}

const product = { name: item, rate: 600, unit: 'Unit' };

function makeInvoice() {
  const fyo = makeFyo();
  fyo.doc.getDoc = async () => ({ trackItem: true, inventory });
  return {
    fyo,
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

function stockMap(batchQuantity) {
  return {
    [item]: { availableQty: batchQuantity + 10, [batch]: batchQuantity },
  };
}
