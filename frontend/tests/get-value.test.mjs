import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas } from './helpers/fyo.mjs';

test('getValue reads one field, returns undefined only when missing and keeps errors', async () => {
  const calls = [];
  const party = { name: 'Customer', email: 'customer@example.com' };
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }
    call(method, schemaName, name, fields) {
      calls.push([method, schemaName, name, fields]);
      if (name === 'Offline') throw new Error('Server unavailable');
      return name === party.name ? { name, email: party.email } : {};
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels({});

  assert.equal(
    await fyo.getValue('Party', 'Customer', 'email'),
    'customer@example.com'
  );
  assert.deepEqual(calls, [['get', 'Party', 'Customer', 'email']]);
  assert.equal(await fyo.getValue('Party', 'Missing', 'email'), undefined);
  await assert.rejects(
    fyo.getValue('Party', 'Offline', 'email'),
    /Server unavailable/
  );

  const cached = fyo.doc.getNewDoc('Party', { name: 'Cached', email: 'x@y.z' });
  calls.length = 0;
  assert.equal(await fyo.getValue('Party', cached.name, 'email'), 'x@y.z');
  assert.deepEqual(calls, []);
});
