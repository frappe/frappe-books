import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  evaluateCondition,
  FrappeDoc,
  frappeModels,
  fyo,
  getActiveDoctype,
  getFileFields,
  isAccessoryMode,
  loadTestDocTypes,
  newFrappeDoc,
  setDocType,
  stubFrappe,
  toActiveDoctype,
} from './helpers/frappe.mjs';

await loadTestDocTypes();
const PREVIEW = '/api/method/frappe_books.accessory.preview.preview';

function setAccessoryMode(on) {
  globalThis.window = {
    location: { hostname: 'books.localhost' },
    frappe: {
      boot: {
        time_zone: { system: 'Asia/Kolkata' },
        books: { accessory_mode: on },
      },
    },
  };
}

afterEach(() => {
  delete globalThis.window;
});

test('standalone shows the Books doctypes', () => {
  assert.equal(isAccessoryMode(), false);
  assert.equal(
    getActiveDoctype(frappeModels.SalesInvoice),
    'Books Sales Invoice'
  );
  assert.equal(
    getActiveDoctype(frappeModels.NumberSeries),
    'Books Number Series'
  );
  assert.equal(toActiveDoctype('Books Customer'), 'Books Customer');
});

test('accessory mode shows the ERPNext twins and leaves out standalone-only models', () => {
  setAccessoryMode(true);
  assert.equal(getActiveDoctype(frappeModels.SalesInvoice), 'Sales Invoice');
  assert.equal(getActiveDoctype(frappeModels.PaymentEntry), 'Payment Entry');
  assert.equal(getActiveDoctype(frappeModels.Company), 'Company');
  assert.equal(getActiveDoctype(frappeModels.Address), 'Address');
  for (const name of [
    'NumberSeries',
    'GetStarted',
    'SetupWizard',
    'ItemEnquiry',
    'CustomForm',
    'AccountingSettings',
    'InventorySettings',
    'Defaults',
    'POSSettings',
  ]) {
    assert.equal(getActiveDoctype(frappeModels[name]), null, name);
  }

  // UI settings stay Books'.
  assert.equal(
    getActiveDoctype(frappeModels.SystemSettings),
    'Books System Settings'
  );
  assert.equal(
    getActiveDoctype(frappeModels.ERPNextSettings),
    'Books ERPNext Settings'
  );
  assert.equal(toActiveDoctype('Books Customer'), 'Customer');
});

test('accessory mode turns on every feature ERPNext has, whatever the Books settings say', () => {
  fyo.singles.AccountingSettings = { enable_inventory: false };
  assert.equal(fyo.isFeatureOn('enable_inventory'), false);

  setAccessoryMode(true);
  assert.equal(fyo.isFeatureOn('enable_inventory'), true);
  assert.equal(fyo.isFeatureOn('enable_batches'), true);
  assert.equal(fyo.isFeatureOn('enable_item_enquiry'), false);
  assert.equal(fyo.isFeatureOn('enable_form_customization'), false);
});

test("conditions with Frappe's form globals evaluate, and Desk-only ones show the field", () => {
  assert.equal(
    evaluateCondition('eval:in_list(["Pay"], doc.payment_type)', {
      payment_type: 'Pay',
    }),
    true
  );
  assert.equal(
    evaluateCondition('eval:flt(doc.write_off_amount)!=0', {
      write_off_amount: '0',
    }),
    false
  );
  assert.equal(
    evaluateCondition('eval:doc.is_return;', { is_return: 0 }),
    false
  );
  assert.equal(
    evaluateCondition('eval:erpnext.stock.is_return(doc)', {}),
    true
  );
});

test('accessory mode previews through ERPNext with the fields edited since the last preview', async () => {
  setAccessoryMode(true);
  const previews = [];
  stubFrappe(({ path, body }) => {
    previews.push({ path, body });
    return { message: { ...body.doc, rate: 4 } };
  });
  const item = newFrappeDoc('Item', { name: 'Assam' });

  await item.set('item_type', 'Product');
  await item.whenFilled();
  assert.equal(previews[0].path, PREVIEW);
  assert.equal(previews[0].body.doc.doctype, 'Books Item');
  assert.deepEqual(previews[0].body.changed, { doc: ['item_type'], rows: {} });
  assert.equal(item.rate.float, 4);

  // An answered preview forgets its edits; amounts go to ERPNext as numbers.
  item.push('uom_conversions', { uom: 'Box' });
  const [row] = item.uom_conversions;
  await row.set('conversion_factor', 12);
  await item.set('rate', fyo.pesa(5));
  await item.whenFilled();
  const { changed, doc } = previews[1].body;
  assert.deepEqual(changed.doc, ['uom_conversions', 'rate']);
  assert.deepEqual(changed.rows, { [row.name]: ['conversion_factor'] });
  assert.equal(doc.rate, 5);
});

test('files hold the fields an ERPNext form shows and the mandatory ones a user fills', () => {
  setAccessoryMode(true);
  const field = (fieldname, extra = {}) => ({
    fieldname,
    fieldtype: 'Data',
    label: fieldname,
    ...extra,
  });
  const fields = [
    field('positioned'),
    field('picked', { moreDetails: 'picked' }),
    field('needed', { moreDetails: 'ifMissing', required: true }),
    field('defaulted', {
      moreDetails: 'ifMissing',
      required: true,
      default: 'A',
    }),
    field('filled', {
      moreDetails: 'ifMissing',
      required: true,
      readOnly: true,
    }),
    field('optional', { moreDetails: 'ifMissing' }),
  ];
  setDocType('AccessoryFiles', {
    doctype: 'Accessory Files',
    meta: { name: 'Accessory Files', fields: [] },
    schema: { name: 'AccessoryFiles', label: 'Accessory Files', fields },
    Model: FrappeDoc,
    tables: {},
    placements: {},
  });

  assert.deepEqual(
    getFileFields('AccessoryFiles').map(({ fieldname }) => fieldname),
    ['positioned', 'picked', 'needed']
  );
});
