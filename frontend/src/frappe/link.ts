import { translateValue } from 'fyo/utils/translation';
import { call } from 'src/web/api';
import { getValue, type Filter } from './api';
import { getDocType, isFrappeBacked } from './doctypes';
import { getOpenFrappeDocs } from './documents';
import { getSchema } from './registry';

export type LinkRecord = Record<string, string | null | undefined> & {
  name: string;
  label?: string | null;
};
export type LinkOption = { label: string; value: string; record: LinkRecord };

/**
 * Link options from Frappe's link search, each with its record's `fields`.
 * Letters typed are matched in order, e.g. `rce` finds `Rice`, as Books'
 * link search always has; Frappe matches a translated doctype's names, in the
 * user's language, by the text typed. Labels are those of Frappe's link search.
 */
export async function searchFrappeLink(
  schemaName: string,
  text: string,
  filters: Filter[] | null,
  limit: number,
  fields: string[] = []
): Promise<LinkOption[]> {
  const { doctype, meta } = getDocType(schemaName);
  const words = text.trim();
  const records = await call<LinkRecord[]>('frappe.desk.search.search_widget', {
    doctype,
    txt: meta.translated_doctype ? words : [...words].join('%'),
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
  return getDocType(schemaName).meta.translated_doctype
    ? translateValue(label)
    : label;
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
