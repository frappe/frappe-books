import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

async function makeShipmentFromInvoice(mapped) {
  const fyo = await makeFyo();
  fyo.getValue = async () => undefined;
  const invoice = fyo.doc.getNewDoc('SalesInvoice', { name: 'SINV-1' });
  fyo.db.getMapped = async (...args) => {
    mapped.push(args);
    return {
      party: 'Customer',
      backReference: 'SINV-1',
      items: [{ item: 'Pen', quantity: 1, serialNumber: 'SN-7' }],
    };
  };
  fyo.doc.getDoc = async () => invoice;
  return fyo.doc.getNewDoc('Shipment', { backReference: 'SINV-1' });
}

test('a shipment picked for an invoice gets the rows the server maps', async () => {
  const mapped = [];
  const shipment = await makeShipmentFromInvoice(mapped);
  await shipment.setFieldsFromBackReference();
  assert.deepEqual(mapped, [
    [
      'Shipment',
      'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.make_shipment',
      'SINV-1',
    ],
  ]);
  assert.equal(shipment.party, 'Customer');
  assert.equal(shipment.items[0].serialNumber, 'SN-7');
});

test('a receipt made from an invoice gets new serial numbers from the series', async () => {
  const fyo = await makeFyo();
  const values = { hasSerialNumber: true };
  fyo.getValue = async (_schemaName, _name, fieldname) => values[fieldname];
  fyo.db.getNewSeriesNames = async (_schemaName, _item, count) =>
    ['SN-001', 'SN-002'].slice(0, count);
  const receipt = fyo.doc.getNewDoc('PurchaseReceipt', {
    backReference: 'PINV-1',
    items: [{ item: 'Pen', quantity: 2 }],
  });
  assert.equal(
    await receipt.items[0].getDefaultSerialNumbers(),
    'SN-001\nSN-002'
  );
});

test('a material receipt row gets new serial numbers and leaves its batch to the server', async () => {
  const fyo = await makeFyo();
  const values = { hasBatch: true, hasSerialNumber: true };
  fyo.getValue = async (_schemaName, _name, fieldname) => values[fieldname];
  const reserved = [];
  fyo.db.getNewSeriesNames = async (schemaName) => {
    reserved.push(schemaName);
    return ['SN-001'];
  };
  fyo.doc.getDoc = async () => ({ loadAndGetLink() {} });
  const movement = fyo.doc.getNewDoc('StockMovement', {
    movementType: 'MaterialReceipt',
    items: [{ quantity: 1, batch: 'INK-001' }],
  });
  const row = movement.items[0];
  await row.set('item', 'Pen');
  assert.deepEqual([row.batch, row.serialNumber], ['', 'SN-001']);
  assert.deepEqual(reserved, ['SerialNumber']);
  await row.set('quantity', 0);
  assert.equal(row.serialNumber, '');
});
