import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import { stubFrappe } from './helpers/frappe.mjs';
import {
  commonDocSubmit,
  dialog,
  frappeModels,
  fyo,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  toast,
} from './helpers/ui.mjs';

stubFrappe(({ body }) => ({ message: getBooksMeta(body.doctypes) }));
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();
fyo.singles.AccountingSettings = { enable_inventory: true };
toast.success = () => {};

/**
 * Submits a saved draft of Pen, short by one where it ships from, answering
 * Yes to every dialog. Returns the dialog titles and the document submitted.
 */
async function submitShortInvoice(makeShipment) {
  const titles = [];
  dialog.confirm = ({ title, actions }) => {
    titles.push(title);
    void actions[0].onClick();
  };
  let submitted;
  stubFrappe(({ path, body }) => {
    if (path.endsWith('get_sale_shortfalls')) {
      return { message: [{ item: 'Pen', quantity: 1 }] };
    }
    submitted = body.document;
    return { docs: [{ ...body.document, docstatus: 1 }] };
  });
  const invoice = newFrappeDoc('SalesInvoice', {
    name: 'SINV-1001',
    date: new Date('2026-01-01T00:00:00Z'),
    make_auto_stock_transfer: makeShipment,
    items: [{ item: 'Pen', quantity: 2 }],
  });
  Object.assign(invoice, { docstatus: 0, _notInserted: false, _dirty: false });
  assert.equal(await commonDocSubmit(invoice), true);
  return { titles, submitted };
}

test('a Yes to insufficient stock for the shipment submits the invoice without it', async () => {
  const { titles, submitted } = await submitShortInvoice(true);

  assert.deepEqual(titles, ['Insufficient Quantity', 'Submit SINV-1001?']);
  assert.equal(submitted.make_auto_stock_transfer, 0);
});

test('an invoice that makes no shipment submits without a stock warning', async () => {
  const { titles, submitted } = await submitShortInvoice(false);

  assert.deepEqual(titles, ['Submit SINV-1001?']);
  assert.equal(submitted.make_auto_stock_transfer, 0);
});
