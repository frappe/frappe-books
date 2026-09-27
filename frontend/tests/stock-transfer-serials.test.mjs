import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

async function makeShipmentFromInvoice() {
  const fyo = await makeFyo();
  const values = { hasSerialNumber: true, serialNumberSeries: 'SN-' };
  fyo.getValue = async (_schemaName, _name, fieldname) => values[fieldname];
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    name: 'SINV-1',
    items: [{ item: 'Pen', quantity: 1, serialNumber: 'SN-7' }],
  });
  invoice.getStockTransfer = async () => ({
    party: 'Customer',
    terms: '',
    date: new Date(),
    items: [{ item: 'Pen', quantity: 1 }],
  });
  const series = { name: 'SN-', start: 1, padZeros: 3, setAndSync() {} };
  fyo.doc.getDoc = async (schemaName) =>
    schemaName === 'SerialNumberSeries' ? series : invoice;
  fyo.db.exists = async (_schemaName, name) => name === 'SN-';
  return fyo.doc.getNewDoc('Shipment', { backReference: 'SINV-1' });
}

test('a shipment made from an invoice ships the invoiced serial numbers', async () => {
  const shipment = await makeShipmentFromInvoice();
  await shipment.setFieldsFromBackReference();
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

test('a material receipt row suggests a batch and new serial numbers', async () => {
  const fyo = await makeFyo();
  const values = { hasBatch: true, hasSerialNumber: true };
  fyo.getValue = async (_schemaName, _name, fieldname) => values[fieldname];
  fyo.db.getNewSeriesNames = async (schemaName) =>
    schemaName === 'Batch' ? ['PEN-001'] : ['SN-001'];
  fyo.doc.getDoc = async () => ({ loadAndGetLink() {} });
  const movement = fyo.doc.getNewDoc('StockMovement', {
    movementType: 'MaterialReceipt',
    items: [{ quantity: 1 }],
  });
  const row = movement.items[0];
  await row.set('item', 'Pen');
  assert.deepEqual([row.batch, row.serialNumber], ['PEN-001', 'SN-001']);
  await row.set('quantity', 0);
  assert.equal(row.serialNumber, '');
});
