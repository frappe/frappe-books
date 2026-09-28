import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  evaluateReadOnly,
  fieldProperties,
  FrappeDatabaseDemux,
  getSchemas,
  makeFyo,
} from './helpers/accounting.mjs';

function getField(schemaName, fieldname, docfield, customFields = []) {
  const properties = {
    ...fieldProperties,
    [schemaName]: { ...fieldProperties[schemaName], [fieldname]: docfield },
  };
  const schemas = getSchemas('-', customFields, properties);
  return schemas[schemaName].fields.find((f) => f.fieldname === fieldname);
}

test('the server decides required, default, read only and minimum value', () => {
  const email = getField('Party', 'email', {
    fieldtype: 'Data',
    reqd: 1,
    read_only: 1,
  });
  assert.equal(email.required, true);
  assert.equal(email.readOnly, true);

  const rate = getField('Item', 'rate', {
    fieldtype: 'Currency',
    non_negative: 1,
    default: '5',
  });
  assert.equal(rate.minvalue, 0);
  assert.equal(rate.default, 5);

  const role = getField('Party', 'role', {
    fieldtype: 'Select',
    options: 'Both\nCustomer',
  });
  assert.equal(role.required, false);
  assert.equal(role.default, undefined);
});

test('the server date defaults Now and Today give a new document the current date', async () => {
  const fyo = await makeFyo();
  for (const schemaName of [
    'SalesInvoice',
    'Payment',
    'JournalEntry',
    'Shipment',
  ]) {
    const before = Date.now();
    const { date } = fyo.doc.getNewDoc(schemaName);
    assert.ok(date instanceof Date, schemaName);
    assert.ok(
      date.getTime() >= before && date.getTime() <= Date.now(),
      schemaName
    );
  }
});

test('Frappe field types and links become Books field types and targets', () => {
  const cases = [
    ['Item', 'image', { fieldtype: 'Attach Image' }, 'AttachImage'],
    ['Payment', 'attachment', { fieldtype: 'Attach' }, 'Attachment'],
    ['Item', 'description', { fieldtype: 'Code' }, 'Text'],
  ];
  for (const [schemaName, fieldname, docfield, fieldtype] of cases) {
    assert.equal(
      getField(schemaName, fieldname, docfield).fieldtype,
      fieldtype
    );
  }

  const party = getField('SalesInvoice', 'party', {
    fieldtype: 'Link',
    options: 'Party',
  });
  assert.equal(party.target, 'Party');
  const name = getField('PaymentFor', 'referenceName', {
    fieldtype: 'Dynamic Link',
    options: 'referenceType',
  });
  assert.deepEqual(
    [name.fieldtype, name.references],
    ['DynamicLink', 'referenceType']
  );
  const check = getField('Item', 'trackItem', {
    fieldtype: 'Check',
    default: '1',
  });
  assert.equal(check.default, true);
});

test('option values come from the server and labels from the schema file', () => {
  const movementType = getField('StockMovement', 'movementType', {
    fieldtype: 'Select',
    options: 'MaterialIssue\nManufacture\nOnHold',
  });
  assert.deepEqual(movementType.options, [
    { value: 'MaterialIssue', label: 'Material Issue' },
    { value: 'Manufacture', label: 'Manufacture' },
    { value: 'OnHold', label: 'OnHold' },
  ]);
});

test('computed and reference fields keep the type the Books app gives them', () => {
  const amountPaid = getField('Payment', 'amountPaid', {
    fieldtype: 'Currency',
    read_only: 1,
  });
  assert.equal(amountPaid.readOnly, undefined);

  const referenceType = getField('PaymentFor', 'referenceType', {
    fieldtype: 'Link',
    options: 'DocType',
    default: 'SalesInvoice',
  });
  assert.equal(referenceType.fieldtype, 'Select');
  assert.deepEqual(
    referenceType.options.map((option) => option.value),
    ['SalesInvoice', 'PurchaseInvoice']
  );
  assert.equal(referenceType.default, 'SalesInvoice');
});

test('a custom field takes the server properties of its hosted column', () => {
  const region = getField(
    'Party',
    'region',
    { fieldtype: 'Data', label: 'Region', reqd: 1 },
    [{ parent: 'Party', fieldname: 'region', section: 'Location' }]
  );
  assert.equal(region.isCustom, true);
  assert.equal(region.label, 'Region');
  assert.equal(region.section, 'Location');
  assert.equal(region.required, true);
});

test('a custom field without a Custom Field on the server is left out', () => {
  const schemas = getSchemas('-', [{ parent: 'Party', fieldname: 'region' }]);
  assert.equal(
    schemas.Party.fields.some((field) => field.fieldname === 'region'),
    false
  );
});

test('a field set only once is read only after the first save', () => {
  const unit = getField('Item', 'unit', {
    fieldtype: 'Link',
    options: 'UOM',
    set_only_once: 1,
  });
  assert.equal(
    evaluateReadOnly(unit, { inserted: false, canWrite: true }),
    false
  );
  assert.equal(
    evaluateReadOnly(unit, { inserted: true, canWrite: true }),
    true
  );
});

before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
});
after(() => {
  delete globalThis.window;
});

test('the schema map asks the server for field properties in one request', async () => {
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    const isProperties = url.endsWith('get_field_properties');
    const message = isProperties
      ? { Party: { email: { fieldtype: 'Data', reqd: 1 } } }
      : [];
    return Response.json({ message });
  };

  const schemas = await new FrappeDatabaseDemux().getSchemaMap();

  assert.deepEqual(requests.sort(), [
    '/api/method/frappe_books.ui_api.database_call',
    '/api/method/frappe_books.ui_api.get_field_properties',
  ]);
  const email = schemas.Party.fields.find((f) => f.fieldname === 'email');
  assert.equal(email.required, true);
});
