import { getSchemas } from 'schemas';
import schemaMapping from '../../../../frappe_books/schema_mapping.json';
import { getDoctypeFieldProperties } from '../../helpers/doctypeFieldProperties';

const doctypes = import.meta.glob(
  '../../../../frappe_books/frappe_books/doctype/*/*.json',
  { eager: true, import: 'default' }
);

/** The app's schemas with the field properties the server sends for the DocType files. */
export function getTestSchemas() {
  const fieldProperties = getDoctypeFieldProperties(
    Object.values(doctypes) as Parameters<typeof getDoctypeFieldProperties>[0],
    schemaMapping.doctypes
  );
  return getSchemas('-', [], fieldProperties);
}
