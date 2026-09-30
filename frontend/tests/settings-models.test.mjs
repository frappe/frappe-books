import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getMetaBundle } from './helpers/doctypes.mjs';
import {
  evaluateHidden,
  evaluateReadOnly,
  frappeModels,
  fyo,
  getFrappeDoc,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

const hidden = (doc, fieldname) => evaluateHidden(doc.fieldMap[fieldname], doc);
const readOnly = (doc, fieldname) =>
  evaluateReadOnly(doc.fieldMap[fieldname], doc);
const fieldnames = (schemaName) =>
  getSchema(schemaName)
    .fields.filter((field) => !field.meta)
    .map(({ fieldname }) => fieldname);

test('each Get Started task is checked by a Books Get Started field', async () => {
  const config = readFileSync(
    new URL('../src/utils/getStartedConfig.ts', import.meta.url),
    'utf8'
  );
  const tasks = [...config.matchAll(/fieldname: '(\w+)'/g)].map(
    ([, fieldname]) => fieldname
  );
  assert.equal(tasks.length, 12);
  assert.deepEqual(
    tasks.filter((fieldname) => !fieldnames('GetStarted').includes(fieldname)),
    []
  );

  stubFrappe(() => ({
    data: { name: 'Books Get Started', sales_item_created: 1 },
  }));
  const getStarted = await getFrappeDoc('GetStarted', 'GetStarted');
  assert.equal(getStarted.get('sales_item_created'), true);
  assert.equal(fyo.singles.GetStarted, getStarted);
});

test('POS Settings hide barcode and visibility fields as the features they need are off', async () => {
  fyo.singles.InventorySettings = { enable_barcodes: false };
  fyo.singles.AccountingSettings = {};
  const settings = newFrappeDoc('POSSettings');
  assert.equal(hidden(settings, 'weight_enabled_barcode'), true);
  assert.equal(hidden(settings, 'item_visibility'), true);

  fyo.singles.InventorySettings = { enable_barcodes: true };
  fyo.singles.AccountingSettings = { enablePointOfSaleWithOutInventory: true };
  assert.equal(hidden(settings, 'weight_enabled_barcode'), false);
  assert.equal(hidden(settings, 'check_digits'), true);
  assert.equal(hidden(settings, 'item_visibility'), false);
  await settings.set('weight_enabled_barcode', true);
  assert.equal(hidden(settings, 'check_digits'), false);
  assert.equal(hidden(settings, 'item_code_digits'), false);
  assert.equal(hidden(settings, 'item_weight_digits'), false);
});

test('an inventory feature cannot be turned off once it is on', async () => {
  const settings = newFrappeDoc('InventorySettings');
  for (const fieldname of [
    'enable_barcodes',
    'enable_batches',
    'enable_serial_number',
    'enable_uom_conversions',
  ]) {
    assert.equal(readOnly(settings, fieldname), false);
    await settings.set(fieldname, true);
    assert.equal(readOnly(settings, fieldname), true);
  }

  assert.equal(readOnly(settings, 'enable_point_of_sale'), false);
});
