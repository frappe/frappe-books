import { translateValue } from 'fyo/utils/translation';
import { serverHtmlToText } from 'src/utils/serverHtml';
import { call } from 'src/web/api';
import { getValue } from './api';
import { getDocType, isFrappeBacked } from './doctypes';
import type { DeskFilters } from './erpnextQueries';
import { getOpenFrappeDocs } from './documents';
import { getSchema } from './registry';

export type LinkRecord = Record<string, string | null | undefined> & {
  name: string;
  label?: string | null;
};
export type LinkOption = {
  label: string;
  value: string;
  record: LinkRecord;
  description?: string;
};

/** How a Link searches: with Desk's filters, a list or a dict, and maybe a whitelisted query method. */
export interface LinkSearch {
  query?: string;
  filters: DeskFilters | null;
}

type QueryRow = { value: string; label?: string; description?: string };

/** Link options for `search`: from its query method, as Desk's link searches, else from `searchFrappeLink`. */
export async function searchLink(
  schemaName: string,
  text: string,
  search: LinkSearch,
  limit: number,
  fields: string[] = []
): Promise<LinkOption[]> {
  if (!search.query) {
    return searchFrappeLink(schemaName, text, search.filters, limit, fields);
  }

  // A query method reads the text as typed, e.g. to rank names that start with it.
  const rows = await call<QueryRow[]>('frappe.desk.search.search_link', {
    doctype: getLinkDoctype(schemaName).doctype,
    txt: text,
    query: search.query,
    filters: search.filters ?? {},
    page_length: limit,
  });
  return rows.map(({ value, label, description }) => ({
    label: label || value,
    value,
    record: { name: value },
    description: description ? toDescriptionText(description) : undefined,
  }));
}

/** A query method's description, which may be HTML, like a customer's address lines, as one line of text. */
function toDescriptionText(html: string): string {
  return html
    .split(/<br\s*\/?>/i)
    .map((line) => serverHtmlToText(line))
    .filter(Boolean)
    .join(', ');
}

/**
 * Link options from Frappe's link search, each with its record's `fields`.
 * Letters typed are matched in order, e.g. `rce` finds `Rice`, as Books'
 * link search always has; Frappe matches a translated doctype's names, in the
 * user's language, and those of a doctype Books has no screen for, by the
 * text typed. Labels are those of Frappe's link search.
 */
export async function searchFrappeLink(
  schemaName: string,
  text: string,
  filters: LinkSearch['filters'],
  limit: number,
  fields: string[] = []
): Promise<LinkOption[]> {
  const { doctype, asTyped } = getLinkDoctype(schemaName);
  const words = text.trim();
  const records = await call<LinkRecord[]>('frappe.desk.search.search_widget', {
    doctype,
    txt: asTyped ? words : [...words].join('%'),
    filters: filters ?? [],
    filter_fields: fields,
    page_length: limit,
    as_dict: true,
  });
  return records.map((record) => ({
    label: getLinkLabel(schemaName, record.label || record.name),
    value: record.name,
    record,
  }));
}

/** A linked record's name or title as Frappe shows it: in the user's language for a translated doctype. */
export function getLinkLabel(schemaName: string, label: string): string {
  return getLinkDoctype(schemaName).translated ? translateValue(label) : label;
}

/**
 * The doctype a link searches: its schema's, or, for an ERPNext doctype
 * Books has no screen for, like a Cost Center in accessory mode, the target
 * itself. Books has no meta of those, which may be translated, like a Stock
 * Entry Type, so their search takes the text as typed, as Desk's does.
 */
function getLinkDoctype(schemaName: string) {
  if (!isFrappeBacked(schemaName)) {
    return { doctype: schemaName, translated: false, asTyped: true };
  }

  const { doctype, meta } = getDocType(schemaName);
  const translated = !!meta.translated_doctype;
  return { doctype, translated, asTyped: translated };
}

/**
 * What a link to `name` shows: the record's display field, like an address's
 * text, when its schema has one, else its label. An open record shows what a
 * quick edit just saved; otherwise only that field is fetched.
 */
export async function getLinkDisplayValue(
  schemaName: string | undefined,
  name: string | undefined
): Promise<string | undefined> {
  if (!schemaName || !isFrappeBacked(schemaName)) {
    return name;
  }

  const field = getSchema(schemaName)?.linkDisplayField;
  if (!field) {
    return name && getLinkLabel(schemaName, name);
  }

  if (!name) {
    return '';
  }

  const open = getOpenFrappeDocs(schemaName).find((doc) => doc.name === name);
  const value = open
    ? open.get(field)
    : await getValue(getDocType(schemaName).doctype, name, field);
  return (value as string | undefined) ?? '';
}
