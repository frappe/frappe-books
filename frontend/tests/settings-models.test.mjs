import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
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
import { getLayout } from './helpers/models.mjs';
import { previousForms } from './helpers/previousForms.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
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
  fyo.singles.AccountingSettings = {
    enable_point_of_sale_with_out_inventory: true,
  };
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

test('the rules of each Frappe-backed model name fields of its DocType', () => {
  const problems = Object.entries(frappeModels).flatMap(
    ([schemaName, Model]) => {
      const known = fieldnames(schemaName);
      const doc = newFrappeDoc(schemaName);
      const maps = {
        filters: Model.filters,
        createFilters: Model.createFilters,
        hidden: doc.hidden,
        readOnly: doc.readOnly,
        validations: doc.validations,
      };
      return Object.entries(maps).flatMap(([map, rules]) =>
        Object.keys(rules ?? {})
          .filter((fieldname) => !known.includes(fieldname))
          .map((fieldname) => `${schemaName}.${map}.${fieldname}`)
      );
    }
  );
  assert.deepEqual(problems, []);
});

test('Defaults hide inventory and POS fields as those features are off', () => {
  fyo.singles.AccountingSettings = {};
  fyo.singles.InventorySettings = {};
  const defaults = newFrappeDoc('Defaults');
  assert.equal(hidden(defaults, 'shipment_terms'), true);
  assert.equal(hidden(defaults, 'pos_customer'), true);
  assert.equal(hidden(defaults, 'sales_invoice_terms'), false);

  fyo.singles.AccountingSettings = { enable_inventory: true };
  fyo.singles.InventorySettings = { enable_point_of_sale: true };
  assert.equal(hidden(defaults, 'shipment_terms'), false);
  assert.equal(hidden(defaults, 'pos_customer'), false);
  assert.equal(hidden(defaults, 'pos_cash_denominations'), false);
});

test('Defaults and POS profiles offer the button colours they offered', () => {
  for (const schemaName of ['Defaults', 'POSProfile']) {
    const colourFields = getSchema(schemaName).fields.filter(({ fieldname }) =>
      fieldname.endsWith('_button_colour')
    );
    assert.equal(colourFields.length, 7);
    for (const { fieldname, options } of colourFields) {
      assert.deepEqual(options, previousForms.colors.Buttons, fieldname);
    }
  }
});

test('the General tab shows the fields, placeholders and sections it showed', () => {
  const layout = getSchema('AccountingSettings')
    .fields.filter((field) => !field.meta && !field.hidden)
    .map(({ fieldname, placeholder, section, readOnly }) =>
      [fieldname, placeholder ?? '', section, readOnly ? 'read only' : '']
        .join(' | ')
        .trim()
    );
  assert.deepEqual(layout.slice(0, 5), [
    'fullname |  | Default |',
    'company_name |  | Default | read only',
    'bank_name |  | Default | read only',
    'country | Select Country | Default | read only',
    'email |  | Default |',
  ]);
  assert.deepEqual(layout.slice(-2), [
    'tax_id | CHE-123.456.789 | Default |',
    'gstin | 27AAAAA0000A1Z5 | Default |',
  ]);
});

test('General settings show the regional tax ID of the company country', async () => {
  const settings = newFrappeDoc('AccountingSettings', { country: 'India' });
  assert.equal(hidden(settings, 'gstin'), false);
  assert.equal(hidden(settings, 'tax_id'), true);

  await settings.set('country', 'Switzerland');
  assert.equal(hidden(settings, 'gstin'), true);
  assert.equal(hidden(settings, 'tax_id'), false);
});

test('discounts lead to pricing rules, then coupons, and stay on once on', async () => {
  const settings = newFrappeDoc('AccountingSettings');
  assert.equal(hidden(settings, 'discount_account'), true);
  assert.equal(hidden(settings, 'enable_pricing_rule'), true);

  await settings.set('enable_discounting', true);
  assert.equal(readOnly(settings, 'enable_discounting'), true);
  assert.equal(hidden(settings, 'discount_account'), false);
  assert.equal(hidden(settings, 'enable_pricing_rule'), false);
  assert.equal(hidden(settings, 'enable_coupon_code'), true);

  await settings.set('enable_pricing_rule', true);
  assert.equal(hidden(settings, 'enable_coupon_code'), false);
  assert.equal(readOnly(settings, 'enable_pricing_rule'), false);
});

test('the System tab offers sample dates and takes custom formats and locales', async () => {
  const field = (fieldname) =>
    getSchema('SystemSettings').fields.find((f) => f.fieldname === fieldname);
  assert.deepEqual(field('date_format').options.slice(0, 2), [
    { value: 'dd/MM/yyyy', label: '23/03/2022' },
    { value: 'MM/dd/yyyy', label: '03/23/2022' },
  ]);
  assert.equal(field('currency').readOnly, true);
  assert.deepEqual(fieldnames('SystemSettings').slice(4, 8), [
    'locale',
    'display_precision',
    'currency',
    'internal_precision',
  ]);

  const settings = newFrappeDoc('SystemSettings');
  await settings.set('date_format', 'EEE, d MMM y');
  await settings.set('locale', 'de-CH');
  await assert.rejects(
    settings.set('display_precision', 10),
    /between 0 and 9/
  );
});

test('the setup wizard shows the fields, placeholders and sections it showed', () => {
  const layout = getSchema('SetupWizard')
    .fields.filter((field) => !field.meta && !field.hidden)
    .map(({ fieldname, placeholder, section }) =>
      [fieldname, placeholder ?? '', section].join(' | ')
    );
  assert.deepEqual(layout, [
    'logo |  | Default',
    'company_name | Company Name | Default',
    'fullname | John Doe | Default',
    'email | john@doe.com | Default',
    'country | Select Country | Locale',
    'currency | Currency | Locale',
    'bank_name | Prime Bank | Accounting',
    'chart_of_accounts | Select CoA | Accounting',
    'fiscal_year_start | Fiscal Year Start Date | Accounting',
    'fiscal_year_end | Fiscal Year End Date | Accounting',
  ]);
  assert.equal(frappeModels.SetupWizard.previewMethod, 'preview');
});

test('the Print tab shows the fields, placeholders, colours and sections it showed', () => {
  assert.deepEqual(
    getLayout(getSchema('PrintSettings')),
    previousForms.layouts.PrintSettings
  );
  const color = getSchema('PrintSettings').fields.find(
    ({ fieldname }) => fieldname === 'color'
  );
  assert.deepEqual(color.options, previousForms.colors.PrintSettings);

  const settings = newFrappeDoc('PrintSettings');
  assert.equal(hidden(settings, 'terms_and_conditions'), true);
  settings.displaytermsandconditions = true;
  assert.equal(hidden(settings, 'terms_and_conditions'), false);
});
