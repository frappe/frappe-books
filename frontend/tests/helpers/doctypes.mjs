import { readFileSync, readdirSync } from 'node:fs';

const appRoot = new URL('../../../frappe_books/', import.meta.url);

export const mapping = readJson(
  new URL('schema_mapping.json', appRoot)
).doctypes;
export const doctypes = readDoctypes(new URL('frappe_books/doctype/', appRoot));

function readDoctypes(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('__'))
    .map(({ name }) => readJson(new URL(`${name}/${name}.json`, directory)));
}

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** The field properties the server sends for the DocType files, and schemas built with them. */
export function withFieldProperties({
  getSchemas,
  getDoctypeFieldProperties,
  getDoctypeSearchFields,
}) {
  const fieldProperties = getDoctypeFieldProperties(doctypes, mapping);
  return {
    fieldProperties,
    searchFields: getDoctypeSearchFields?.(doctypes, mapping),
    getSchemas: (countryCode, customFields, properties = fieldProperties) =>
      getSchemas(countryCode, customFields, properties),
  };
}
