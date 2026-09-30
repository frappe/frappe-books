import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  getMappedBooksDoc,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
  toSchema,
  toSchemaName,
} from './helpers/frappe.mjs';

const billMeta = {
  name: 'Books Bill',
  autoname: 'hash',
  permissions: [],
  fields: [
    {
      fieldname: 'party_type',
      fieldtype: 'Link',
      label: 'Type',
      options: 'DocType',
      default: 'Books Party',
    },
    {
      fieldname: 'party',
      fieldtype: 'Dynamic Link',
      label: 'Party',
      options: 'party_type',
    },
    {
      fieldname: 'lines',
      fieldtype: 'Table',
      label: 'Lines',
      options: 'Books Bill Line',
    },
    {
      fieldname: 'notes',
      fieldtype: 'Table',
      label: 'Notes',
      options: 'Books Bill Note',
    },
  ],
};

const lineMeta = {
  name: 'Books Bill Line',
  istable: 1,
  permissions: [],
  fields: [
    { fieldname: 'item', fieldtype: 'Data', label: 'Item', in_list_view: 1 },
    { fieldname: 'amount', fieldtype: 'Float', label: 'Amount', in_list_view: 1 },
  ],
};

const noteMeta = {
  name: 'Books Bill Note',
  istable: 1,
  permissions: [],
  fields: [{ fieldname: 'note', fieldtype: 'Data', label: 'Note' }],
};

class BillLine extends FrappeDoc {
  static presentation = {
    label: 'Bill Line',
    quickEditFields: ['amount', 'item'],
    tableFields: ['amount', 'item'],
  };
}

class Bill extends FrappeDoc {
  static doctype = 'Books Bill';
  static presentation = {
    label: 'Bill',
    rowEditTables: ['lines'],
    options: { party_type: [{ value: 'Books Party', label: 'Party' }] },
  };
  static tableModels = { lines: BillLine };
}

window.frappe.boot.books.doctypes = {
  ...window.frappe.boot.books.doctypes,
  Bill: 'Books Bill',
  BillLine: 'Books Bill Line',
  Party: 'Books Party',
};
stubFrappe(({ path }) =>
  path.endsWith('getdoctype')
    ? { docs: [billMeta, lineMeta, noteMeta] }
    : { data: [] }
);
registerFrappeModels({ Bill });
await loadFrappeDocTypes();

const field = (schemaName, fieldname) =>
  getSchema(schemaName).fields.find((field) => field.fieldname === fieldname);

test('a model lists the choices of a DocType reference, which a Dynamic Link follows', () => {
  assert.equal(field('Bill', 'party_type').fieldtype, 'Select');
  assert.deepEqual(field('Bill', 'party_type').options, [
    { value: 'Books Party', label: 'Party' },
  ]);
  assert.equal(field('Bill', 'party_type').default, 'Books Party');
  assert.equal(field('Bill', 'party').create, true);
  assert.equal(toSchemaName('Books Party'), 'Party');
  assert.equal(toSchemaName('Party'), 'Party');
});

test('rows of a table take the model its parent names, with its presentation', () => {
  const bill = newFrappeDoc('Bill');
  bill.push('lines', { item: 'Pen' });
  bill.push('notes', { note: 'Fragile' });

  assert.ok(bill.lines[0] instanceof BillLine);
  assert.equal(bill.notes[0].constructor, FrappeDoc);
  assert.equal(getSchema('BillLine').label, 'Bill Line');
  assert.deepEqual(getSchema('BillLine').quickEditFields, ['amount', 'item']);
  assert.deepEqual(getSchema('BillLine').tableFields, ['amount', 'item']);
  assert.equal(getSchema('Books Bill Note').label, 'Books Bill Note');
});

test('a model opens the rows of the tables it names in the row editor', () => {
  assert.equal(field('Bill', 'lines').edit, true);
  assert.equal(field('Bill', 'notes').edit, undefined);
});

test('without a presentation, table columns are the in_list_view fields', () => {
  const schema = toSchema(lineMeta, 'Line', { label: 'Line' }, {
    schemaNames: {},
    roles: [],
    placements: {},
  });
  assert.deepEqual(schema.tableFields, ['item', 'amount']);
});

test('a mapper builds an unsaved Frappe-backed document; unset values keep defaults', async () => {
  const requests = stubFrappe(() => ({
    message: {
      name: null,
      doctype: 'Books Bill',
      party_type: null,
      party: 'Acme',
      lines: [{ name: null, item: 'Pen', amount: 3 }],
    },
  }));

  const bill = await getMappedBooksDoc(
    { schemaName: 'Item', name: 'Pen' },
    'Bill',
    'make_bill'
  );

  assert.equal(
    requests[0].path,
    '/api/method/frappe_books.frappe_books.doctype.books_item.books_item.make_bill'
  );
  assert.equal(requests[0].body.source_name, 'Pen');
  assert.ok(bill instanceof Bill);
  assert.equal(bill.notInserted, true);
  assert.ok(bill.name);
  assert.equal(bill.party, 'Acme');
  assert.equal(bill.party_type, 'Books Party');
  assert.ok(bill.lines[0] instanceof BillLine);
  assert.equal(bill.lines[0].amount, 3);
  assert.ok(bill.lines[0].name);
});
