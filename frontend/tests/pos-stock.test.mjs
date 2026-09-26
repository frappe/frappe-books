import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getItemQtyMap,
  validateQty,
  getPOSInventory,
  getPOSBatchQuantity,
  validatePOSStock,
  validateSinv,
} from './helpers/accounting.mjs';
import { loadMethod } from './helpers/vue-method.mjs';

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

for (const component of [
  'Classic/SelectedItemRow',
  'Modern/ModernPOSSelectedItemRow',
]) {
  test(`${component} displays batch stock at the POS warehouse`, async () => {
    const fyo = makeFyo();
    const getAvailableQtyInBatch = await loadMethod(
      `src/components/POS/${component}.vue`,
      'getAvailableQtyInBatch',
      { fyo, getPOSBatchQuantity }
    );
    assert.equal(
      await getAvailableQtyInBatch.call({ row: { item, batch } }),
      4
    );
    assert.equal(await getAvailableQtyInBatch.call({ row: { item } }), 0);
  });
}

test('selecting an unavailable batch cannot replace the card with stock from other warehouses', async () => {
  const pos = await makePOS(0);
  await pos.handleBatchSelected(batch);
  assert.equal(pos.sinvDoc.items.length, 0);
  assert.equal(pos.items[0].availableQty, 10);
  assert.match(pos.errors[0], /POS Counter for batch DEMO-COFFEE-2026.*Available: 0/);
});

test('selecting a stocked batch preserves the total on the card and checks added quantity', async () => {
  const pos = await makePOS(4);
  await pos.handleBatchSelected(batch);
  assert.equal(pos.sinvDoc.items[0].quantity, 2);
  assert.equal(pos.items[0].availableQty, 14);

  pos.pendingBatchItem = { item: pos.items[0], quantity: 3 };
  await pos.handleBatchSelected(batch);
  assert.equal(pos.sinvDoc.items[0].quantity, 2);
  assert.match(pos.errors[0], /Available: 4; required: 5/);
});

test('checkout refreshes stale availability and the card before validation', async () => {
  const pos = await makePOS(4);
  pos.sinvDoc.items = [{ item, batch, quantity: 2 }];
  pos.itemQtyMap = {};
  const validate = await loadMethod('src/pages/POS/POS.vue', 'validate', {
    validateSinv,
    validateShipment: async () => {},
  });
  await validate.call(pos);
  assert.equal(pos.items[0].availableQty, 14);
});

test('a payment retry does not require stock that has already shipped', async () => {
  const pos = await makePOS(0);
  Object.assign(pos.sinvDoc, {
    isSubmitted: true,
    stockNotTransferred: false,
    items: [{ item, batch, quantity: 2 }],
  });
  const validate = await loadMethod('src/pages/POS/POS.vue', 'validate', {
    validateSinv,
    validateShipment: async () => assert.fail('Serial numbers already shipped'),
  });
  await validate.call(pos);
});

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
          .filter((row) =>
            row.item === name &&
            (!location || row.location === location) &&
            row.batch === selectedBatch
          )
          .reduce((total, row) => total + row.quantity, 0),
    },
  };
}

async function makePOS(batchQuantity) {
  const fyo = makeFyo();
  fyo.doc.getDoc = async () => ({ trackItem: true, inventory });
  const product = { name: item, rate: 600, unit: 'Unit', availableQty: 0 };
  const errors = [];
  const handleBatchSelected = await loadMethod(
    'src/pages/POS/POS.vue',
    'handleBatchSelected',
    {
      getPOSInventory,
      validatePOSStock,
      ModelNameEnum: { Item: 'Item' },
      showToast: ({ message }) => errors.push(message),
      t: (parts, ...values) => String.raw({ raw: parts }, ...values),
    }
  );
  return {
    fyo,
    errors,
    handleBatchSelected,
    items: [product],
    itemQtyMap: {},
    pendingBatchItem: { item: product, quantity: 2 },
    sinvDoc: {
      fyo,
      items: [],
      async append(_field, row) { this.items.push(row); },
      async runFormulas() {},
    },
    async applyPricingRule() {},
    async setItemQtyMap() {
      this.itemQtyMap = {
        [item]: { availableQty: batchQuantity + 10, [batch]: batchQuantity },
      };
    },
    async setItems() {
      product.availableQty = this.itemQtyMap[item].availableQty;
    },
  };
}
