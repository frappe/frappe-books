import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  getModel,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
  toSchemaName,
} from './helpers/frappe.mjs';

const voucherMeta = {
  name: 'Books Voucher',
  permissions: [],
  fields: [
    {
      fieldname: 'lines',
      fieldtype: 'Table',
      label: 'Lines',
      options: 'Books Voucher Line',
    },
  ],
};
const lineMeta = {
  name: 'Books Voucher Line',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'account',
      fieldtype: 'Link',
      label: 'Account',
      options: 'Books Account',
    },
  ],
};

class VoucherLine extends FrappeDoc {
  static presentation = {
    label: 'Voucher Line',
    fields: { account: { groupBy: 'rootType' } },
  };
  static filters = { account: () => ({ isGroup: false }) };
}

class Voucher extends FrappeDoc {
  static doctype = 'Books Voucher';
  static presentation = { label: 'Voucher' };
  static rowModels = { lines: VoucherLine };
}

stubFrappe(({ path }) =>
  path.endsWith('get_books_meta')
    ? { message: { metas: [voucherMeta, lineMeta], placements: {} } }
    : { data: [] }
);
registerFrappeModels({ Voucher });
await loadFrappeDocTypes();

test("a table's rows use the row model the parent names, with its presentation", async () => {
  assert.equal(getModel('VoucherLine'), VoucherLine);
  assert.equal(getSchema('VoucherLine').label, 'Voucher Line');
  assert.equal(getSchema('VoucherLine').fields[0].groupBy, 'rootType');

  const voucher = newFrappeDoc('Voucher');
  await voucher.append('lines', { account: 'Cash' });
  assert.ok(voucher.lines[0] instanceof VoucherLine);
  clearTimeout(voucher._previewTimer);
});

test('a doctype a Frappe-backed document holds is shown by its schema', () => {
  assert.equal(toSchemaName('Books Voucher'), 'Voucher');
  assert.equal(toSchemaName('Voucher'), 'Voucher');
  assert.equal(toSchemaName('Books Nothing'), undefined);
});
