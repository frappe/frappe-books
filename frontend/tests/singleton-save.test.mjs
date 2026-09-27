import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

const settings = [
  ['SystemSettings', 'darkMode', true],
  ['AccountingSettings', 'enableFormCustomization', true],
  ['InventorySettings', 'enableBarcodes', true],
  ['POSSettings', 'canChangeRate', true],
  ['PrintSettings', 'displayLogo', true],
  ['Defaults', 'salesInvoiceTerms', 'Payment within 30 days'],
  ['GetStarted', 'onboardingComplete', true],
  ['Misc', 'useFullWidth', true],
  ['SetupWizard', 'companyName', 'Test Company'],
];

for (const [schemaName, fieldname, value] of settings) {
  test(`${schemaName} saves only defined fields and retains the saved value`, async () => {
    const { fyo, doc, writes } = await makeFixture(schemaName);
    await doc.set(fieldname, value);
    await doc.sync();

    assert.equal(doc.isSyncing, false);
    assert.equal(doc.dirty, false);
    assert.equal(writes.length, 1);
    assert.equal(Object.hasOwn(writes[0], 'modified'), false);
    assert.equal(Object.hasOwn(writes[0], 'modifiedBy'), false);
    assert.equal(Object.hasOwn(writes[0], '__expectedModified'), false);
    const saved = await fyo.db.get(schemaName, schemaName);
    assert.equal(saved[fieldname], value);
  });
}

test('System Settings can save again after reload', async () => {
  const { fyo, doc, writes } = await makeFixture('SystemSettings');
  await doc.set('darkMode', true);
  await doc.sync();
  fyo.doc.removeFromCache('SystemSettings', 'SystemSettings');
  const reloaded = await fyo.doc.getDoc('SystemSettings');
  assert.equal(reloaded.darkMode, true);
  await reloaded.set('darkMode', false);
  await reloaded.set('displayPrecision', 3);
  await reloaded.sync();
  assert.equal(writes.length, 2);
  assert.equal(reloaded.darkMode, false);
  assert.equal(reloaded.displayPrecision, 3);
});

const setupValues = {
  fullname: 'Test Owner',
  companyName: 'Test Company',
  bankName: 'Test Bank',
  country: 'India',
  email: 'test@example.com',
  currency: 'INR',
  chartOfAccounts: 'Standard',
  fiscalYearStart: '2026-04-01',
  fiscalYearEnd: '2027-03-31',
};
const requiredValues = {
  AccountingSettings: setupValues,
  SetupWizard: setupValues,
  POSSettings: { cashAccount: 'Cash' },
};

async function makeFixture(schemaName) {
  const schemas = getSchemas('-', []);
  let stored;
  const writes = [];
  class SettingsStore {
    getSchemaMap() {
      return schemas;
    }
    call(method, target, value) {
      assert.equal(target, schemaName);
      if (method === 'get') {
        return structuredClone(stored);
      }
      if (method === 'update') {
        const fields = new Set(schemas[target].fields.map((f) => f.fieldname));
        assert.ok(Object.keys(value).every((key) => fields.has(key)));
        stored = structuredClone(value);
        writes.push(stored);
        return structuredClone(stored);
      }
      throw new Error(`Unexpected database call: ${method}`);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: SettingsStore });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const doc = fyo.doc.getNewDoc(schemaName, requiredValues[schemaName] ?? {});
  stored = fyo.db.converter.toRawValueMap(schemaName, doc.getValidDict());
  // The fixture represents an existing singleton without loading linked records.
  doc._notInserted = false;
  return { fyo, doc, writes };
}
