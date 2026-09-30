import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

// Settings singles still served through the bridge; Frappe-backed ones are in frappe-singles.test.mjs.
const settings = [['PrintSettings', 'displayLogo', true]];

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
    const saved = await fyo.db.get(schemaName, schemaName);
    assert.equal(saved[fieldname], value);
  });
}

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
  const doc = fyo.doc.getNewDoc(schemaName);
  stored = fyo.db.converter.toRawValueMap(schemaName, doc.getValidDict());
  // The fixture represents an existing singleton without loading linked records.
  doc._notInserted = false;
  return { fyo, doc, writes };
}
