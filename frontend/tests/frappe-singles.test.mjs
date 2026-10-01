import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  fyo,
  getFrappeDoc,
  getSchema,
  getSingleSchemaNames,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

const MODIFIED = '2026-09-30 10:00:00.123456';
const settingsMeta = {
  name: 'Books Test Settings',
  issingle: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'date_format',
      fieldtype: 'Autocomplete',
      label: 'Date Format',
      options: 'dd/MM/yyyy\nyyyy-MM-dd',
    },
    {
      fieldname: 'pos_ui',
      fieldtype: 'Select',
      label: 'POS UI',
      options: 'Classic\nModern',
    },
    {
      fieldname: 'dark_mode',
      fieldtype: 'Check',
      label: 'Dark mode',
      default: '0',
    },
  ],
};

class TestSettings extends FrappeDoc {
  static doctype = 'Books Test Settings';
  static presentation = {
    label: 'Test Settings',
    fields: {
      date_format: {
        allowCustom: true,
        optionLabels: { 'dd/MM/yyyy': '23/03/2022' },
      },
    },
  };
}

stubFrappe(({ path }) =>
  path.endsWith('get_books_meta')
    ? { message: { metas: [settingsMeta], placements: {} } }
    : { data: [] }
);
registerFrappeModels({ TestSettings });
await loadFrappeDocTypes();

function stubSettings(saved) {
  return stubFrappe(({ method, body }) =>
    method === 'GET'
      ? { data: saved }
      : { data: { ...saved, ...body, modified: MODIFIED } }
  );
}

test('a single has no ID field and its fields show as the model presents them', () => {
  const schema = getSchema('TestSettings');
  const field = (fieldname) =>
    schema.fields.find((f) => f.fieldname === fieldname);

  assert.equal(schema.isSingle, true);
  assert.equal(field('name'), undefined);
  assert.equal(field('date_format').allowCustom, true);
  assert.deepEqual(field('date_format').options, [
    { value: 'dd/MM/yyyy', label: '23/03/2022' },
    { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
  ]);
  assert.equal(field('pos_ui').allowCustom, undefined);
  assert.deepEqual(getSingleSchemaNames(), ['TestSettings']);
});

test('a single loads by its doctype name and is the settings every reader gets', async () => {
  const requests = stubSettings({
    name: 'Books Test Settings',
    date_format: 'yyyy-MM-dd',
    dark_mode: 1,
    modified: MODIFIED,
  });
  const settings = await getFrappeDoc('TestSettings', 'TestSettings');

  assert.equal(
    requests[0].path,
    '/api/v2/document/Books Test Settings/Books Test Settings'
  );
  assert.equal(settings.name, 'TestSettings');
  assert.equal(settings.dark_mode, true);
  assert.equal(fyo.singles.TestSettings, settings);
  assert.equal(await getFrappeDoc('TestSettings', 'TestSettings'), settings);
});

test('a single saves by its doctype name and refuses a stale copy by modified', async () => {
  stubSettings({
    name: 'Books Test Settings',
    dark_mode: 0,
    modified: MODIFIED,
  });
  const settings = await getFrappeDoc('TestSettings', 'TestSettings', {
    refresh: true,
  });
  const requests = stubSettings({ name: 'Books Test Settings' });
  await settings.set('date_format', 'MMM d, y');
  await settings.sync();

  const [save] = requests;
  assert.equal(save.method, 'PUT');
  assert.equal(
    save.path,
    '/api/v2/document/Books Test Settings/Books Test Settings'
  );
  assert.equal(save.body.date_format, 'MMM d, y');
  assert.equal(save.body.modified, MODIFIED);
  assert.equal(settings.dirty, false);

  const later = '2026-09-30 11:00:00.000000';
  const next = stubFrappe(({ body }) => ({
    data: { name: 'Books Test Settings', ...body, modified: later },
  }));
  await settings.set('dark_mode', true);
  await settings.sync();
  assert.equal(next[0].body.modified, MODIFIED);
  assert.equal(settings.modified, later);
});

test('a new copy of a single replaces its values', async () => {
  const requests = stubSettings({ name: 'Books Test Settings' });
  const settings = newFrappeDoc('TestSettings', { pos_ui: 'Modern' });
  await settings.sync();

  const [save] = requests;
  assert.equal(save.method, 'PUT');
  assert.equal(
    save.path,
    '/api/v2/document/Books Test Settings/Books Test Settings'
  );
  assert.equal(save.body.pos_ui, 'Modern');
  assert.equal('modified' in save.body, false);
  assert.equal(settings.notInserted, false);
});
