import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import { previousForms } from './helpers/previousForms.mjs';
import {
  evaluateHidden,
  evaluateReadOnly,
  evaluateRequired,
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

const stockSchemas = ['StockMovement', 'Shipment', 'PurchaseReceipt'];
const rowSchemas = {
  StockMovement: 'StockMovementItem',
  Shipment: 'ShipmentItem',
  PurchaseReceipt: 'PurchaseReceiptItem',
};
stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
registerFrappeModels(
  Object.fromEntries(stockSchemas.map((name) => [name, frappeModels[name]]))
);
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

test('movement types keep their labels', () => {
  const { options } = getSchema('StockMovement').fields.find(
    ({ fieldname }) => fieldname === 'movement_type'
  );
  assert.deepEqual(
    options.map(({ label }) => label),
    ['Material Issue', 'Material Receipt', 'Material Transfer', 'Manufacture']
  );
});

test('a movement row asks for the locations its type moves stock between', () => {
  const movement = newFrappeDoc('StockMovement');
  const row = movement._getChildDoc({ item: 'Pen' }, 'items');
  const state = (fieldname) =>
    [evaluateRequired, evaluateReadOnly].map((evaluate) =>
      evaluate(row.fieldMap[fieldname], row)
    );
  const expected = {
    MaterialIssue: [
      [true, false],
      [false, true],
    ],
    MaterialReceipt: [
      [false, true],
      [true, false],
    ],
    MaterialTransfer: [
      [true, false],
      [true, false],
    ],
    Manufacture: [
      [false, false],
      [false, false],
    ],
  };
  for (const [movementType, locations] of Object.entries(expected)) {
    movement.movement_type = movementType;
    assert.deepEqual(
      [state('from_location'), state('to_location')],
      locations,
      movementType
    );
  }
});

test('stock rows hide the fields of inventory features turned off', () => {
  for (const name of stockSchemas) {
    const row = newFrappeDoc(name)._getChildDoc({ item: 'Pen' }, 'items');
    const hidden = () =>
      ['batch', 'serial_number', 'transfer_unit'].map((fieldname) =>
        evaluateHidden(row.fieldMap[fieldname], row)
      );
    fyo.singles.InventorySettings = {};
    assert.deepEqual(hidden(), [true, true, true], name);
    fyo.singles.InventorySettings = {
      enable_batches: true,
      enable_serial_number: true,
      enable_uom_conversions: true,
    };
    assert.deepEqual(hidden(), [false, false, false], name);
  }
});

test('transfer rows show HSN/SAC only for an Indian company', () => {
  for (const name of ['Shipment', 'PurchaseReceipt']) {
    const row = newFrappeDoc(name)._getChildDoc({ item: 'Pen' }, 'items');
    const hidden = () => evaluateHidden(row.fieldMap.hsn_code, row);

    fyo.singles.AccountingSettings = { country: 'United States' };
    assert.equal(hidden(), true, name);
    fyo.singles.AccountingSettings = { country: 'India' };
    assert.equal(hidden(), false, name);
  }
});

test('a submitted transfer hides the references and notes it does not have', () => {
  const fields = ['terms', 'attachment', 'back_reference', 'return_against'];
  const shipment = newFrappeDoc('Shipment');
  const shown = () =>
    fields.filter(
      (fieldname) => !evaluateHidden(shipment.fieldMap[fieldname], shipment)
    );
  assert.deepEqual(shown(), fields);

  shipment.docstatus = 1;
  shipment.terms = 'Fragile';
  assert.deepEqual(shown(), ['terms']);
});

test('a transfer row shows the item discounts of its invoice only when it has them', () => {
  const row = newFrappeDoc('Shipment')._getChildDoc({ item: 'Pen' }, 'items');
  const hidden = (fieldname) => evaluateHidden(row.fieldMap[fieldname], row);
  assert.deepEqual(
    [hidden('item_discount_amount'), hidden('item_discount_percent')],
    [true, true]
  );
  row.item_discount_percent = 10;
  assert.equal(hidden('item_discount_percent'), false);
});

test('a row takes its item defaults again when its item changes', async () => {
  const movement = newFrappeDoc('StockMovement');
  await movement.append('items', { item: 'Pen', batch: 'PEN-1' });
  const [row] = movement.items;
  await row.set('item', 'Ink');
  clearTimeout(movement._previewTimer);

  const sent = row.getFrappeValues({ clearServerFilled: true });
  for (const fieldname of ['rate', 'unit', 'batch', 'serial_number']) {
    assert.equal(fieldname in sent, false, fieldname);
  }
});

test('picking an invoice fills a shipment with the rows its mapper gives', async () => {
  const requests = stubFrappe(() => ({
    message: {
      doctype: 'Books Shipment',
      party: 'Customer',
      back_reference: 'SINV-1',
      return_against: null,
      items: [{ item: 'Pen', quantity: 2, serial_number: 'SN-7' }],
    },
  }));
  const shipment = newFrappeDoc('Shipment');

  await shipment.set('back_reference', 'SINV-1');
  clearTimeout(shipment._previewTimer);

  assert.equal(
    requests[0].path,
    '/api/method/frappe.model.mapper.make_mapped_doc'
  );
  assert.deepEqual(requests[0].body, {
    method:
      'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.make_shipment',
    source_name: 'SINV-1',
  });
  assert.equal(shipment.party, 'Customer');
  assert.deepEqual(
    shipment.items.map(({ item, quantity, serial_number }) => [
      item,
      quantity,
      serial_number,
    ]),
    [['Pen', 2, 'SN-7']]
  );
});

test('links of stock documents filter by the vocabulary of their targets', async () => {
  const requests = stubFrappe(() => ({
    data: [{ unit: 'Unit', uom_conversions: [{ uom: 'Box' }] }],
  }));
  const shipment = newFrappeDoc('Shipment');
  const receipt = newFrappeDoc('PurchaseReceipt');
  const movementRow = newFrappeDoc('StockMovement')._getChildDoc(
    { item: 'Pen' },
    'items'
  );
  const { Shipment, PurchaseReceipt } = frappeModels;

  assert.deepEqual(Shipment.filters.party(shipment), [
    ['role', 'in', ['Customer', 'Both']],
  ]);
  assert.deepEqual(PurchaseReceipt.createFilters.party(receipt), [
    ['role', '=', 'Supplier'],
  ]);
  assert.deepEqual(getModel('ShipmentItem').filters.item(), [
    ['item_usage', 'not in', ['Purchases']],
    ['track_item', '=', 1],
  ]);
  assert.deepEqual(
    await getModel('StockMovementItem').filters.transfer_unit(movementRow),
    [['name', 'in', ['Unit', 'Box']]]
  );
  assert.deepEqual(requests[0].params.filters, [['name', '=', 'Pen']]);
});

test('transfer rows offer only the batches and units of their item', async () => {
  stubFrappe(() => ({
    data: [{ unit: 'Unit', uom_conversions: [{ uom: 'Box' }] }],
  }));
  for (const name of ['Shipment', 'PurchaseReceipt']) {
    const row = newFrappeDoc(name)._getChildDoc({ item: 'Pen' }, 'items');
    const { filters } = getModel(rowSchemas[name]);

    assert.deepEqual(filters.batch(row), [['item', '=', 'Pen']], name);
    assert.deepEqual(
      await filters.transfer_unit(row),
      [['name', 'in', ['Unit', 'Box']]],
      name
    );
  }
});

test('stock lists show and filter by their Frappe fieldnames', () => {
  for (const name of stockSchemas) {
    const { columns } = frappeModels[name].getListViewSettings(fyo);
    const fieldnames = getSchema(name).fields.map(({ fieldname }) => fieldname);
    for (const column of columns) {
      const fieldname = typeof column === 'string' ? column : column.fieldname;
      assert.ok(fieldnames.includes(fieldname), `${name}.${fieldname}`);
    }
  }

  const fields = getFilterFields(
    getSchema('Shipment').fields,
    frappeModels.Shipment.getListViewSettings(fyo).columns
  );
  const status = fields.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Saved', 'Submitted', 'Return', 'Return Issued', 'Cancelled']
  );
  for (const fieldname of ['name', 'number_series', 'owner', 'creation']) {
    assert.ok(
      fields.some((field) => field.fieldname === fieldname),
      fieldname
    );
  }
});

test('a submitted movement links to its accounting and stock entries', () => {
  const actions = frappeModels.StockMovement.getActions(fyo);
  const movement = newFrappeDoc('StockMovement', { docstatus: 1 });

  assert.deepEqual(
    actions.map(({ label }) => label),
    ['Accounting Entries', 'Stock Entries']
  );
  assert.ok(actions.every((action) => action.condition(movement)));
});

test('a submitted shipment offers an invoice and a return by Frappe fieldnames', () => {
  fyo.singles.AccountingSettings = { enable_invoice_returns: true };
  const [invoice, , , makeReturn] = getStockTransferActions(fyo, 'Shipment');
  const shipment = newFrappeDoc('Shipment', { docstatus: 1 });

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
