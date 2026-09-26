import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMethod } from './helpers/vue-method.mjs';
import { Importer, makeFyo } from './helpers/accounting.mjs';

test('import link checks query each linked schema once', async () => {
  const fyo = await makeFyo();
  const requests = [];
  fyo.db.getAll = async (schemaName, { filters }) => {
    requests.push([schemaName, filters.name[1]]);
    return schemaName === 'Account' ? [{ name: 'Cash' }] : [];
  };
  const importer = new Importer('Party', fyo);
  importer.assignedTemplateFields = [
    'Party.name',
    'Party.defaultAccount',
    'Party.currency',
  ];
  importer.valueMatrix = [
    [{ value: 'A' }, { value: 'Cash' }, { value: 'XYZ' }],
    [{ value: 'B' }, { value: 'Bank' }, { value: 'XYZ' }],
    [{ value: 'C' }, { value: 'Cash' }, { value: '' }],
  ];

  assert.deepEqual(await importer.checkLinks(), [
    { schemaName: 'Account', schemaLabel: 'Account', name: 'Bank' },
    { schemaName: 'Currency', schemaLabel: 'Currency', name: 'XYZ' },
  ]);
  assert.deepEqual(requests, [
    ['Account', ['Cash', 'Bank']],
    ['Currency', ['XYZ']],
  ]);
});

test('an import that saves but fails to submit is reported as a draft', async () => {
  const importDoc = await loadMethod(
    'src/pages/ImportWizard.vue',
    'importDoc',
    { getMessage: (error) => error.message }
  );
  const wizard = {
    success: [],
    successOldName: [],
    failed: [],
    t: (strings, ...values) =>
      strings.reduce((text, part, i) => text + values[i - 1] + part),
  };
  const doc = {
    name: 'New Invoice 01',
    async sync() {
      this.name = 'SINV-1';
    },
    async submit() {
      throw new Error('Insufficient stock');
    },
  };

  await importDoc.call(wizard, doc, true);
  assert.deepEqual(wizard.success, []);
  assert.deepEqual(wizard.successOldName, ['New Invoice 01']);
  assert.deepEqual(wizard.failed.map((failure) => ({ ...failure })), [
    {
      name: 'SINV-1',
      message: 'Saved as draft, but submit failed: Insufficient stock',
    },
  ]);
});
