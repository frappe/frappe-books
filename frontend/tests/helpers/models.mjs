import { getBooksMeta } from './doctypes.mjs';
import {
  frappeModels,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './frappe.mjs';

/** Loads every Frappe-backed model with its DocType files, as the app does at startup. */
export async function loadFrappeModels() {
  stubFrappe(({ path, body }) =>
    path.endsWith('get_books_meta')
      ? { message: getBooksMeta(body.doctypes) }
      : { data: [] }
  );
  registerFrappeModels(frappeModels);
  await loadFrappeDocTypes();
}

/** The fields a form shows, with their labels, placeholders and sections. */
export function getLayout(schema) {
  return (
    schema.fields
      // Rows never show their name.
      .filter(({ fieldname }) => !(schema.isChild && fieldname === 'name'))
      .filter((field) => !field.meta && !field.hidden)
      .map(({ fieldname, label, placeholder, section }) =>
        [
          fieldname,
          label,
          placeholder ?? '',
          section ?? 'Default',
        ].join(' | ')
      )
  );
}
