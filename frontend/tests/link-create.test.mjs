import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchemas } from './helpers/accounting.mjs';
import { getMetaBundle, mapping } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getDocType,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

test('links of Frappe-backed forms and rows offer Create where the schema files did', () => {
  const bridge = getSchemas('in', [], {});
  const problems = getShownSchemaNames().flatMap((schemaName) => {
    const oldNames = Object.fromEntries(
      Object.entries(mapping[schemaName]?.fields ?? {}).map(
        ([name, fieldname]) => [fieldname, name]
      )
    );
    return getSchema(schemaName)
      .fields.filter(({ fieldtype, readOnly, meta }) => {
        return (
          ['Link', 'DynamicLink'].includes(fieldtype) && !readOnly && !meta
        );
      })
      .filter(({ fieldname, create }) => {
        const old = bridge[schemaName]?.fields.find(
          (field) => field.fieldname === oldNames[fieldname]
        );
        return old && !!create !== !!old.create;
      })
      .map(({ fieldname }) => `${schemaName}.${fieldname}`);
  });
  assert.deepEqual(problems, []);
});

/** The Frappe-backed schemas and the rows of the tables their forms show. */
function getShownSchemaNames() {
  return Object.keys(frappeModels).flatMap((schemaName) => {
    const { schema, tables } = getDocType(schemaName);
    const rows = schema.fields
      .filter(({ fieldtype, hidden }) => fieldtype === 'Table' && !hidden)
      .map(({ fieldname }) => tables[fieldname].schema.name);
    return [schemaName, ...rows];
  });
}
