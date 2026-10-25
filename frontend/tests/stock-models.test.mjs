import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import { previousForms } from './helpers/previousForms.mjs';
import {
  frappeModels,
  fyo,
  getFilterFields,
  getModel,
  getSchema,
  getStockTransferActions,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

const stockSchemas = ['StockEntry', 'DeliveryNote', 'PurchaseReceipt'];
const rowSchemas = {
  StockEntry: 'StockEntryDetail',
  DeliveryNote: 'DeliveryNoteItem',
  PurchaseReceipt: 'PurchaseReceiptItem',
};
stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
// A shipment makes a sales invoice.
registerFrappeModels({
  ...Object.fromEntries(stockSchemas.map((name) => [name, frappeModels[name]])),
  SalesInvoice: frappeModels.SalesInvoice,
});
await loadFrappeDocTypes();
test('stock forms, row editors and tables show what they showed', () => {
  for (const name of [...stockSchemas, ...Object.values(rowSchemas)]) {
    const schema = getSchema(name);
    const previous = previousForms.stock[name];
    assert.deepEqual(getLayout(schema), previous.layout, name);
    if (schema.isChild) {
      assert.deepEqual(
        schema.tableFields,
        previous.tableFields,
        `${name} table`
      );
    }
    assert.deepEqual(
      schema.quickEditFields ?? [],
      previous.quickEditFields,
      `${name} quick edit`
    );
  }
});

test('stock item tables open their rows in the row editor', () => {
  for (const name of stockSchemas) {
    const items = getSchema(name).fields.find(
      ({ fieldname }) => fieldname === 'items'
    );
    assert.equal(items.edit, true, name);
  }
});

test('stock entries take the purposes of ERPNext', () => {
  const { options } = getSchema('StockEntry').fields.find(
    ({ fieldname }) => fieldname === 'purpose'
  );
  assert.deepEqual(
    options.map(({ label }) => label),
    ['Material Issue', 'Material Receipt', 'Material Transfer', 'Repack']
  );
});

test('a stock entry row asks for the warehouses its purpose moves stock between', () => {
  const movement = newFrappeDoc('StockEntry');
  const row = movement._getChildDoc({ item_code: 'Pen' }, 'items');
  const state = (fieldname) =>
    ['required', 'readOnly'].map(
      (rule) => row.getFieldState(row.fieldMap[fieldname])[rule]
    );
  const expected = {
    'Material Issue': [
      [true, false],
      [false, true],
    ],
    'Material Receipt': [
      [false, true],
      [true, false],
    ],
    'Material Transfer': [
      [true, false],
      [true, false],
    ],
    Repack: [
      [false, false],
      [false, false],
    ],
  };
  for (const [purpose, warehouses] of Object.entries(expected)) {
    movement.purpose = purpose;
    assert.deepEqual(
      [state('s_warehouse'), state('t_warehouse')],
      warehouses,
      purpose
    );
  }
});

test('stock rows hide the fields of inventory features turned off', () => {
  for (const name of stockSchemas) {
    const row = newFrappeDoc(name)._getChildDoc({ item_code: 'Pen' }, 'items');
    const stockQty = name === 'StockEntry' ? 'transfer_qty' : 'stock_qty';
    const fieldnames = [
      'batch_no',
      'serial_no',
      'uom',
      stockQty,
      'conversion_factor',
      'qty',
    ];
    const hidden = () =>
      fieldnames.map(
        (fieldname) => row.getFieldState(row.fieldMap[fieldname]).hidden
      );
    // Without unit conversions a row shows its quantity, as invoice rows do.
    fyo.singles.InventorySettings = {};
    assert.deepEqual(hidden(), [true, true, true, true, true, false], name);
    fyo.singles.InventorySettings = {
      enable_batches: true,
      enable_serial_number: true,
      enable_uom_conversions: true,
    };
    assert.deepEqual(
      hidden(),
      [false, false, false, false, false, false],
      name
    );
  }
});

test('transfer rows show HSN/SAC only for an Indian company', () => {
  for (const name of ['DeliveryNote', 'PurchaseReceipt']) {
    const row = newFrappeDoc(name)._getChildDoc({ item_code: 'Pen' }, 'items');
    const hidden = () => row.getFieldState(row.fieldMap.gst_hsn_code).hidden;

    fyo.singles.AccountingSettings = { country: 'United States' };
    assert.equal(hidden(), true, name);
    fyo.singles.AccountingSettings = { country: 'India' };
    assert.equal(hidden(), false, name);
  }
});

test('a submitted transfer hides the references and notes it does not have', () => {
  const fields = ['terms', 'return_against'];
  const shipment = newFrappeDoc('DeliveryNote');
  const shown = () =>
    fields.filter(
      (fieldname) =>
        !shipment.getFieldState(shipment.fieldMap[fieldname]).hidden
    );
  assert.deepEqual(shown(), fields);

  shipment.docstatus = 1;
  shipment.terms = 'Fragile';
  assert.deepEqual(shown(), ['terms']);
});

test('a transfer row shows the item discounts of its invoice only when it has them', () => {
  const row = newFrappeDoc('DeliveryNote')._getChildDoc(
    { item_code: 'Pen' },
    'items'
  );
  const hidden = (fieldname) =>
    row.getFieldState(row.fieldMap[fieldname]).hidden;
  assert.deepEqual(
    [hidden('discount_amount'), hidden('discount_percentage')],
    [true, true]
  );
  row.discount_percentage = 10;
  assert.equal(hidden('discount_percentage'), false);
});

test('a transfer row shows the invoice it was made from only when it has one', () => {
  for (const [name, fieldname] of [
    ['DeliveryNote', 'against_sales_invoice'],
    ['PurchaseReceipt', 'purchase_invoice'],
  ]) {
    const row = newFrappeDoc(name)._getChildDoc({ item_code: 'Pen' }, 'items');
    const hidden = () => row.getFieldState(row.fieldMap[fieldname]).hidden;
    assert.equal(hidden(), true, name);
    row[fieldname] = 'INV-1';
    assert.equal(hidden(), false, name);
  }
});

test('a row takes its item defaults again when its item changes', async () => {
  const movement = newFrappeDoc('StockEntry');
  await movement.append('items', { item_code: 'Pen', batch_no: 'PEN-1' });
  const [row] = movement.items;
  await row.set('item_code', 'Ink');

  const sent = row.getFrappeValues({ clearServerFilled: true });
  for (const fieldname of [
    'basic_rate',
    'stock_uom',
    'uom',
    'transfer_qty',
    'batch_no',
    'serial_no',
  ]) {
    assert.equal(fieldname in sent, false, fieldname);
  }
});

test('a transfer row is priced again in a new unit; a stock entry row is not', () => {
  const { refills: transfer } = getModel('DeliveryNoteItem');
  const { refills: entry } = getModel('StockEntryDetail');

  assert.deepEqual(transfer.uom, ['conversion_factor', 'stock_qty', 'rate']);
  assert.deepEqual(entry.uom, ['conversion_factor', 'transfer_qty']);
  assert.deepEqual(transfer.qty, ['stock_qty']);
  assert.deepEqual(entry.transfer_qty, ['qty']);
});

test('links of stock documents filter by the vocabulary of their targets', async () => {
  const requests = stubFrappe(() => ({
    data: [{ stock_uom: 'Unit', uoms: [{ uom: 'Box' }] }],
  }));
  const movementRow = newFrappeDoc('StockEntry')._getChildDoc(
    { item_code: 'Pen' },
    'items'
  );
  assert.deepEqual(getModel('DeliveryNoteItem').filters.item_code(), [
    ['is_stock_item', '=', 1],
  ]);
  assert.deepEqual(
    await getModel('StockEntryDetail').filters.uom(movementRow),
    [['name', 'in', ['Unit', 'Box']]]
  );
  assert.deepEqual(requests[0].params.filters, [['name', '=', 'Pen']]);
});

test('transfer rows offer only the batches and units of their item', async () => {
  stubFrappe(() => ({
    data: [{ stock_uom: 'Unit', uoms: [{ uom: 'Box' }] }],
  }));
  for (const name of ['DeliveryNote', 'PurchaseReceipt']) {
    const row = newFrappeDoc(name)._getChildDoc({ item_code: 'Pen' }, 'items');
    const { filters } = getModel(rowSchemas[name]);

    assert.deepEqual(filters.batch_no(row), [['item', '=', 'Pen']], name);
    assert.deepEqual(
      await filters.uom(row),
      [['name', 'in', ['Unit', 'Box']]],
      name
    );
  }
});

test('stock lists show and filter by their Frappe fieldnames', () => {
  for (const name of stockSchemas) {
    const { columns } = frappeModels[name].getListViewSettings(fyo);
    const fieldnames = getSchema(name).fields.map(({ fieldname }) => fieldname);
    // A stock entry has no status; its badge draws from its docstatus.
    for (const column of columns.filter(({ badge }) => !badge)) {
      const fieldname = typeof column === 'string' ? column : column.fieldname;
      assert.ok(fieldnames.includes(fieldname), `${name}.${fieldname}`);
    }
  }

  const fields = getFilterFields(
    getSchema('DeliveryNote').fields,
    frappeModels.DeliveryNote.getListViewSettings(fyo).columns
  );
  const status = fields.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    [
      'Draft',
      'To Bill',
      'Partially Billed',
      'Completed',
      'Return',
      'Return Issued',
      'Cancelled',
    ]
  );
  for (const fieldname of ['name', 'naming_series', 'owner', 'creation']) {
    assert.ok(
      fields.some((field) => field.fieldname === fieldname),
      fieldname
    );
  }
});

test('a submitted movement links to its accounting and stock entries', () => {
  const actions = frappeModels.StockEntry.getActions(fyo);
  const movement = newFrappeDoc('StockEntry', { docstatus: 1 });

  assert.deepEqual(
    actions.map(({ label }) => label),
    ['Accounting entries', 'Stock entries']
  );
  assert.ok(actions.every((action) => action.condition(movement)));
});

test('a submitted shipment offers an invoice and a return by Frappe fieldnames', () => {
  fyo.singles.AccountingSettings = { enable_invoice_returns: true };
  const [invoice, , , makeReturn] = getStockTransferActions(
    fyo,
    'DeliveryNote'
  );
  const shipment = newFrappeDoc('DeliveryNote', { docstatus: 1 });

  assert.deepEqual(
    [invoice.condition(shipment), makeReturn.condition(shipment)],
    [true, true]
  );
  shipment.return_against = 'SHPM-1';
  assert.deepEqual(
    [invoice.condition(shipment), makeReturn.condition(shipment)],
    [false, false]
  );
});

test('a shipment made from an invoice, or billed in full, offers no invoice', () => {
  const [invoice] = getStockTransferActions(fyo, 'DeliveryNote');
  const shipment = newFrappeDoc('DeliveryNote', { docstatus: 1 });

  shipment.per_billed = 40;
  assert.equal(invoice.condition(shipment), true);
  shipment.per_billed = 100;
  assert.equal(invoice.condition(shipment), false);
});

/** The form fields in order: fieldname, label, placeholder, section and tab. */
function getLayout(schema) {
  return schema.fields
    .filter(
      (field) => !field.meta && !field.hidden && field.fieldname !== 'name'
    )
    .map((field) =>
      [
        field.fieldname,
        field.label,
        field.placeholder ?? '',
        field.section ?? 'Default',
        field.tab ?? '',
      ].join(' | ')
    );
}
