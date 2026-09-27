import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Importer, importDoc, makeFyo } from './helpers/accounting.mjs';

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
  const results = { success: [], successOldName: [], failed: [] };
  const doc = {
    name: 'New Invoice 01',
    async sync() {
      this.name = 'SINV-1';
    },
    async submit() {
      throw new Error('Insufficient stock');
    },
  };

  await importDoc(doc, true, results);
  assert.deepEqual(results.success, []);
  assert.deepEqual(results.successOldName, ['New Invoice 01']);
  assert.deepEqual(
    results.failed.map((failure) => ({ ...failure })),
    [
      {
        name: 'SINV-1',
        message: 'Saved as draft, but submit failed: Insufficient stock',
      },
    ]
  );
});

test('import columns report duplicates and missing required fields', async () => {
  const importer = new Importer('Party', await makeFyo());
  const required = [...importer.templateFieldsMap.values()].filter(
    (field) => field.required
  );
  assert.ok(required.length > 0);

  importer.assignedTemplateFields = [
    required[0].fieldKey,
    required[0].fieldKey,
    'Party.unknown',
    'Party.unknown',
  ];

  assert.deepEqual(importer.getDuplicateColumns(), [required[0].label]);
  assert.deepEqual(
    importer.getMissingRequiredColumns(),
    required.slice(1).map((field) => field.label)
  );
});

test('child table fields are never required in an import template', async () => {
  const importer = new Importer('SalesInvoice', await makeFyo());
  const childFields = [...importer.templateFieldsMap.values()].filter(
    (field) => field.parentSchemaChildField
  );

  assert.ok(childFields.some((field) => field.fieldname === 'item'));
  assert.ok(childFields.every((field) => !field.required));
});

test('leaving a column out moves the later picked columns up', async () => {
  const importer = new Importer('Party', await makeFyo());
  const [first, second, third] = importer.assignedTemplateFields;

  importer.pickColumn(first, false);

  assert.deepEqual(importer.assignedTemplateFields.slice(0, 2), [
    second,
    third,
  ]);
  assert.equal(importer.assignedTemplateFields.at(-1), null);
  assert.equal(importer.templateFieldsPicked.get(first), false);
});

test('a retry keeps only the rows that were not imported', async () => {
  const importer = new Importer('Party', await makeFyo());
  importer.assignedTemplateFields = ['Party.role', 'Party.name'];
  importer.valueMatrix = [
    [{ value: 'Customer' }, { value: 'A' }],
    [{ value: 'Customer' }, { value: 'B' }],
    [{ value: 'Customer' }, { value: null }],
  ];

  importer.docs = [{ name: 'A' }];

  importer.retryRowsNotImported(['A']);

  assert.deepEqual(
    importer.valueMatrix.map((row) => row[1].value),
    ['B']
  );
  assert.deepEqual(importer.docs, []);
});

test('retrying failed imports keeps the file column order', async () => {
  const fyo = await makeFyo();
  const context = { Importer, fyo };
  const wizardMethod = (name) =>
    loadMethod('src/pages/ImportWizard.vue', name, context);
  const wizard = {
    importType: 'Party',
    successOldName: ['A'],
    get importer() {
      return this.nullOrImporter;
    },
    clear: await wizardMethod('clear'),
    setImportType: await wizardMethod('setImportType'),
  };
  wizard.setImportType('Party');
  wizard.importer.assignedTemplateFields = ['Party.role', 'Party.name'];
  wizard.importer.valueMatrix = [
    [{ value: 'Customer' }, { value: 'A' }],
    [{ value: 'Supplier' }, { value: 'B' }],
  ];
  wizard.successOldName = ['A'];

  (await wizardMethod('clearSuccessfullyImportedEntries')).call(wizard);

  assert.deepEqual(wizard.importer.assignedTemplateFields, [
    'Party.role',
    'Party.name',
  ]);
  assert.deepEqual(
    wizard.importer.valueMatrix.map((row) => row[1].value),
    ['B']
  );
});
