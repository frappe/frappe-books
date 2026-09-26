import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas, getPrintTemplateDocValues } from './helpers/fyo.mjs';

for (const [invoiceType, transferType] of [
  ['SalesInvoice', 'Shipment'],
  ['PurchaseInvoice', 'PurchaseReceipt'],
]) {
  test(`${invoiceType} and ${transferType} print from either side of a circular reference`, async () => {
    const fyo = await makeFixture({
      [invoiceType]: [{ name: 'INV-1', backReference: 'ST-1' }],
      [transferType]: [{ name: 'ST-1', backReference: 'INV-1' }],
    });
    const invoice = await fyo.doc.getDoc(invoiceType, 'INV-1');
    const transfer = await fyo.doc.getDoc(transferType, 'ST-1');

    const values = await getPrintTemplateDocValues(invoice);
    assert.equal(values.backReference, 'ST-1');
    assert.equal(values.links.backReference.name, 'ST-1');
    assert.equal(values.links.backReference.backReference, 'INV-1');
    assert.equal(values.links.backReference.links, undefined);

    const reverse = await getPrintTemplateDocValues(transfer);
    assert.equal(reverse.links.backReference.name, 'INV-1');
    assert.equal(reverse.links.backReference.links, undefined);
    assert.doesNotThrow(() => JSON.stringify(values));
  });
}

test('a self-reference keeps its field value without expanding itself', async () => {
  const fyo = await makeFixture({
    Account: [{ name: 'Self', parentAccount: 'Self' }],
  });
  const values = await getPrintTemplateDocValues(
    await fyo.doc.getDoc('Account', 'Self')
  );
  assert.equal(values.parentAccount, 'Self');
  assert.equal(values.links, undefined);
});

test('cycles through child rows and dynamic links stop at the ancestor', async () => {
  const schemas = structuredClone(getSchemas('-', []));
  schemas.SalesInvoice.fields.push({
    fieldname: 'payment',
    fieldtype: 'Link',
    target: 'Payment',
  });
  const fyo = await makeFixture(
    {
      SalesInvoice: [{ name: 'INV-1', payment: 'PAY-1' }],
      Payment: [
        {
          name: 'PAY-1',
          for: [
            {
              name: 'ROW-1',
              referenceType: 'SalesInvoice',
              referenceName: 'INV-1',
              amount: '125.00',
            },
          ],
        },
      ],
    },
    schemas
  );
  const values = await getPrintTemplateDocValues(
    await fyo.doc.getDoc('SalesInvoice', 'INV-1')
  );
  const row = values.links.payment.for[0];
  assert.equal(row.referenceName, 'INV-1');
  assert.equal(row.links, undefined);
  assert.match(row.amount, /125\.00/);
});

test('shared records remain available in every sibling link and line item', async () => {
  const fyo = await makeFixture({
    SalesInvoice: [
      {
        name: 'INV-1',
        party: 'Customer',
        backReference: 'ST-1',
        items: [
          { name: 'ROW-1', item: 'Product', quantity: 2 },
          { name: 'ROW-2', item: 'Product', quantity: 3 },
        ],
      },
    ],
    Shipment: [{ name: 'ST-1', party: 'Customer', backReference: 'INV-1' }],
    Party: [{ name: 'Customer', email: 'customer@example.com' }],
    Item: [{ name: 'Product', description: 'Shared product' }],
  });
  const invoice = await fyo.doc.getDoc('SalesInvoice', 'INV-1');
  const values = await getPrintTemplateDocValues(invoice);
  assert.equal(values.links.party.email, 'customer@example.com');
  assert.equal(
    values.links.backReference.links.party.email,
    'customer@example.com'
  );
  assert.deepEqual(
    values.items.map((row) => row.links.item.description),
    ['Shared product', 'Shared product']
  );
  assert.deepEqual(
    values.items.map((row) => row.quantity),
    ['2', '3']
  );
  assert.deepEqual(await getPrintTemplateDocValues(invoice), values);
});

test('deep acyclic links remain available to existing custom templates', async () => {
  const fyo = await makeFixture({
    Account: [
      { name: 'Leaf', parentAccount: 'Level 1' },
      { name: 'Level 1', parentAccount: 'Level 2' },
      { name: 'Level 2', parentAccount: 'Level 3' },
      { name: 'Level 3', parentAccount: 'Root' },
      { name: 'Root' },
    ],
  });
  const values = await getPrintTemplateDocValues(
    await fyo.doc.getDoc('Account', 'Leaf')
  );
  assert.equal(
    values.links.parentAccount.links.parentAccount.links.parentAccount.links
      .parentAccount.name,
    'Root'
  );
});

async function makeFixture(records, schemas = getSchemas('-', [])) {
  records = { UOM: [{ name: 'Unit' }], ...records };
  class PrintStore {
    getSchemaMap() {
      return schemas;
    }
    call(method, schemaName, name) {
      assert.equal(method, 'get');
      const doc = records[schemaName]?.find((record) => record.name === name);
      assert.ok(doc, `Missing fixture: ${schemaName} ${name}`);
      return structuredClone(doc);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: PrintStore });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const getDoc = fyo.doc.getDoc.bind(fyo.doc);
  let calls = 0;
  fyo.doc.getDoc = (...args) => {
    // Stop a regression before its microtask loop can hang the test process.
    assert.ok(++calls < 100, 'Print data repeatedly followed circular links');
    return getDoc(...args);
  };
  return fyo;
}

test('loading a document leaves its links to be loaded on access', async () => {
  const fyo = await makeFixture({
    SalesInvoice: [{ name: 'INV-1', party: 'Customer', account: 'Debtors' }],
    Party: [{ name: 'Customer', defaultAccount: 'Debtors' }],
    Account: [{ name: 'Debtors', parentAccount: 'Receivables' }],
  });
  const loads = [];
  const load = fyo.db.get.bind(fyo.db);
  fyo.db.get = (schemaName, name, ...rest) => {
    loads.push(`${schemaName} ${name}`);
    return load(schemaName, name, ...rest);
  };

  const invoice = await fyo.doc.getDoc('SalesInvoice', 'INV-1');
  assert.deepEqual(loads, ['SalesInvoice INV-1']);
  assert.equal(invoice.links, undefined);

  const party = await invoice.loadAndGetLink('party');
  assert.equal(party.name, 'Customer');
  assert.deepEqual(loads, ['SalesInvoice INV-1', 'Party Customer']);
  assert.equal(await invoice.loadAndGetLink('party'), party);
  assert.equal(loads.length, 2);
});
