import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('saving a converted party refreshes its linked lead without another write', async () => {
  const fyo = await makeFyo();
  const lead = fyo.doc.getNewDoc('Lead', {
    name: 'Original Lead',
    status: 'Open',
  });
  const party = fyo.doc.getNewDoc('Party', {
    name: 'Different Party Name',
    fromLead: lead.name,
  });
  const writes = [];
  const warnings = [];
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  fyo.db.insert = async (schema, values) => {
    writes.push(schema);
    return values;
  };
  fyo.db.get = async (schema, name) => {
    assert.equal(schema, 'Lead');
    assert.equal(name, lead.name);
    return { ...lead.getValidDict(), status: 'Converted' };
  };

  await party.sync();

  assert.deepEqual(writes, ['Party']);
  assert.equal(party.dirty, false);
  assert.equal(lead.status, 'Converted');
  assert.deepEqual(warnings, []);
});
