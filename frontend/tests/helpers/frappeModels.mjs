import { getBooksMeta } from './doctypes.mjs';
import {
  getModel,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './frappe.mjs';

/**
 * Registers `models` and loads their DocType files as the app loads their
 * meta at startup. Links and tables target Books schema names, as the boot
 * sends them. Returns the requests made after loading.
 */
export async function loadFrappeModels(models, respond = () => ({ data: [] })) {
  const requests = stubFrappe((request) =>
    request.path.endsWith('get_books_meta')
      ? { message: getBooksMeta(request.body.doctypes) }
      : respond(request)
  );
  registerFrappeModels(models);
  await loadFrappeDocTypes();
  requests.length = 0;
  return requests;
}

/** The form's fields as `fieldname | label | placeholder | section`. */
export function getLayout(schemaName) {
  return getSchema(schemaName)
    .fields.filter((field) => !field.meta)
    .map(({ fieldname, label, placeholder, section }) =>
      [fieldname, label, placeholder, section].join(' | ')
    );
}

/** The list's columns by fieldname. */
export function getColumns(schemaName) {
  return getModel(schemaName)
    .getListViewSettings()
    .columns.map((column) => column.fieldname ?? column);
}
