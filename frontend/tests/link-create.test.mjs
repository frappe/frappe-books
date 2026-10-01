import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';
import { previousForms } from './helpers/previousForms.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

test('links of forms and rows offer Create where the schema files did', () => {
  const problems = Object.entries(previousForms.linkCreate)
    .filter(([key, create]) => {
      const [schemaName, fieldname] = key.split('.');
      const field = getSchema(schemaName).fields.find(
        (field) => field.fieldname === fieldname
      );
      return !!field.create !== create;
    })
    .map(([key]) => key);
  assert.deepEqual(problems, []);
});
