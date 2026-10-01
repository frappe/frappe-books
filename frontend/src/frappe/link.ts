import { translateValue } from 'fyo/utils/translation';
import { call } from 'src/web/api';
import type { QueryFilter } from 'utils/db/types';
import { getValue } from './api';
import { getDocType } from './doctypes';
import { getOpenFrappeDocs } from './documents';
import { toFrappeFilters } from './list';
import { getSchema } from './registry';

export type LinkRecord = Record<string, string | null | undefined> & {
  name: string;
  label?: string | null;
};
export type LinkOption = { label: string; value: string; record: LinkRecord };

/**
 * Link options from Frappe's link search, each with its record's `fields`.
 * Letters typed are matched in order, e.g. `rce` finds `Rice`, as Books'
 * link search always has. Labels are those of Frappe's link search.
 */
export async function searchFrappeLink(
  schemaName: string,
  text: string,
  filters: QueryFilter | null,
  limit: number,
  fields: string[] = []
): Promise<LinkOption[]> {
  const { doctype, meta } = getDocType(schemaName);
  const words = text.trim();
  const records = await call<LinkRecord[]>('frappe.desk.search.search_widget', {
    doctype,
    txt: meta.translated_doctype ? words : [...words].join('%'),
    filters: toFrappeFilters(filters ?? {}),
    filter_fields: fields,
    page_length: limit,
    as_dict: true,
  });
  return records.map((record) => {
    const label = record.label || record.name;
    return {
      label: meta.translated_doctype ? translateValue(label) : label,
      value: record.name,
      record,
    };
  });
}

/**
 * What a link to `name` shows: the record's display field, like an address's
 * text, when its schema has one, else the name. An open record shows what a
 * quick edit just saved; otherwise only that field is fetched.
 */
export async function getLinkDisplayValue(
  schemaName: string | undefined,
  name: string | undefined
): Promise<string | undefined> {
  const field = schemaName && getSchema(schemaName)?.linkDisplayField;
  if (!field) {
    return name;
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
