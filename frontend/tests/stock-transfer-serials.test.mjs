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
