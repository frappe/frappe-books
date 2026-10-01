import { fieldProperties, getSchemas } from './accounting.mjs';
import { getMetaBundle, mapping } from './doctypes.mjs';
import {
  frappeModels,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './frappe.mjs';

/** The schemas the bridge built for each model, to compare Frappe-backed ones with. */
export const bridgeSchemas = getSchemas('in', [], fieldProperties);

/** Loads every Frappe-backed model with its DocType files, as the app does at startup. */
export async function loadFrappeModels() {
  stubFrappe(({ path, body }) =>
    path.endsWith('getdoctype')
      ? { docs: getMetaBundle(body.doctype) }
      : { data: [] }
  );
  registerFrappeModels(frappeModels);
  await loadFrappeDocTypes();
}

/** A schema's DocType fieldname for each of its bridge fieldnames. */
export function getFrappeFieldnames(schemaName) {
  return mapping[schemaName].fields;
}

/** The fields a form shows, by Frappe fieldname, with their labels, placeholders and sections. */
export function getLayout(schema, fieldnames = {}) {
  return (
    schema.fields
      // Rows never show their name.
      .filter(({ fieldname }) => !(schema.isChild && fieldname === 'name'))
      .filter((field) => !field.meta && !field.hidden)
      .map(({ fieldname, label, placeholder, section }) =>
        [
          fieldnames[fieldname] ?? fieldname,
          label,
          placeholder ?? '',
          section ?? 'Default',
        ].join(' | ')
      )
  );
}
