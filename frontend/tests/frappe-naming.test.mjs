import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateReadOnly,
  FrappeDoc,
  getFrappeDoc,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';
import { getQuickEditFieldnames } from './helpers/accounting.mjs';

const regionMeta = {
  name: 'Books Region',
  autoname: 'field:region_name',
  permissions: [],
  fields: [
    {
      fieldname: 'region_name',
      fieldtype: 'Data',
      label: 'Region Name',
      reqd: 1,
    },
    {
      fieldname: 'kind',
      fieldtype: 'Select',
      label: 'Kind',
      options: 'SalesZone\nDepot',
    },
    { fieldname: 'lft', fieldtype: 'Int', label: 'Left', hidden: 1 },
  ],
};

class Region extends FrappeDoc {
  static doctype = 'Books Region';
  static presentation = {
    label: 'Region',
    create: false,
    fields: { kind: { optionLabels: { SalesZone: 'Sales Zone' } } },
    omitFields: ['lft'],
  };
}

stubFrappe(({ path, method }) => {
  if (path.endsWith('get_books_meta')) {
    return { message: { metas: [regionMeta], placements: {} } };
  }

  if (method === 'GET' && path === '/api/v2/document/Books Region/North') {
    return { data: { name: 'North', region_name: 'North', modified: '' } };
  }

  return { data: [] };
});
registerFrappeModels({ Region });
await loadFrappeDocTypes();
const schema = getSchema('Region');

test('a doctype named by a field shows that field as its name', () => {
  const name = schema.fields.find((field) => field.fieldname === 'name');
  assert.equal(schema.naming, 'manual');
  assert.equal(schema.titleField, 'region_name');
  assert.deepEqual([name.label, name.meta], ['Region Name', true]);
});

test('a new document takes a given name in its naming field and follows it', async () => {
  const region = newFrappeDoc('Region', { name: 'South' });
  assert.equal(region.region_name, 'South');

  await region.set('region_name', 'East');
  assert.equal(region.name, 'East');
});

test('a saved document keeps its naming field', async () => {
  const north = await getFrappeDoc('Region', 'North');
  const namingField = north.fieldMap.region_name;
  assert.equal(evaluateReadOnly(namingField, north), true);
  assert.equal(evaluateReadOnly(namingField, newFrappeDoc('Region')), false);
});

test('the presentation labels options and can turn off new documents', () => {
  const kind = schema.fields.find((field) => field.fieldname === 'kind');
  assert.deepEqual(kind.options, [
    { value: 'SalesZone', label: 'Sales Zone' },
    { value: 'Depot', label: 'Depot' },
  ]);
  assert.equal(schema.create, false);
});

test('quick edit asks for the naming field only in its header', () => {
  assert.deepEqual(
    getQuickEditFieldnames({ ...schema, quickEditFields: ['kind'] }),
    ['kind']
  );
});

test('an omitted field is neither shown nor saved', async () => {
  assert.equal(
    schema.fields.some((field) => field.fieldname === 'lft'),
    false
  );
  const north = await getFrappeDoc('Region', 'North');
  assert.equal('lft' in north.getFrappeValues(), false);
});
