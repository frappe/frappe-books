import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

test('a custom check field without a default starts unchecked and saves', async () => {
  class Store {
    getSchemaMap() {
      return getSchemas('-', [
        {
          parent: 'UOM',
          label: 'Fragile',
          fieldname: 'fragile',
          fieldtype: 'Check',
        },
      ]);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels({});

  const doc = fyo.doc.getNewDoc('UOM', { name: 'Box' });
  assert.equal(doc.fragile, false);

  const raw = fyo.db.converter.toRawValueMap('UOM', doc.getValidDict());
  assert.equal(raw.fragile, 0);
});
