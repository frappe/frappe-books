import { readFileSync, readdirSync } from 'node:fs';
import { frappeMetas } from './frappeMetas.mjs';

const appRoot = new URL('../../../frappe_books/', import.meta.url);

export const doctypes = readDoctypes(new URL('frappe_books/doctype/', appRoot));

/**
 * A doctype's meta and its tables' meta, with fields in field order, as
 * Frappe's getdoctype sends them. Currency, Country, Print Format, Address,
 * Contact and Dynamic Link are Frappe's own doctypes.
 */
export function getMetaBundle(name) {
  const meta = getMeta(name);
  const tables = meta.fields
    .filter((field) => field.fieldtype === 'Table')
    .map((field) => getMeta(field.options));
  return [meta, ...tables];
}

/** What frappe_books.meta.get_books_meta answers for the doctypes, from the DocType files. */
export function getBooksMeta(doctypes, placements = {}) {
  const metas = doctypes.flatMap(getMetaBundle);
  const byName = new Map(metas.map((meta) => [meta.name, meta]));
  return { metas: [...byName.values()], placements };
}

function getMeta(name) {
  const meta = [...doctypes, ...frappeMetas].find((meta) => meta.name === name);
  const order = meta.field_order ?? [];
  const fields = [...meta.fields].sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return { permissions: [], ...meta, fields };
}

function readDoctypes(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('__'))
    .map(({ name }) => readJson(new URL(`${name}/${name}.json`, directory)));
}

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/**
 * The field properties the server sends for the DocType files, and schemas built with them.
 * A custom field's `docfield` stands for the properties of its Custom Field.
 */
