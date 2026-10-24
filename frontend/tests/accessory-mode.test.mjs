import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  evaluateCondition,
  frappeModels,
  fyo,
  getActiveDoctype,
  isAccessoryMode,
  toActiveDoctype,
} from './helpers/frappe.mjs';

function setAccessoryMode(on) {
  globalThis.window = { frappe: { boot: { books: { accessory_mode: on } } } };
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
