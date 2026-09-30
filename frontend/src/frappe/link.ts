import { call } from 'src/web/api';
import type { QueryFilter } from 'utils/db/types';
import { getDocuments } from './api';
import { getDocType } from './doctypes';
import { toFrappeFilters } from './list';

type SearchResult = { value: string; label?: string };
type LinkOption = { label: string; value: string; group?: string };

/**
 * Link options from Frappe's link search. Letters typed are matched in
 * order, e.g. `rce` finds `Rice`, as Books' link search always has. With
 * `groupBy`, each option is grouped by that field of its record.
 */
export async function searchFrappeLink(
  schemaName: string,
  text: string,
  filters: QueryFilter | null,
  limit: number,
  groupBy?: string
): Promise<LinkOption[]> {
  const { doctype, meta } = getDocType(schemaName);
  const words = text.trim();
  const results = await call<SearchResult[]>('frappe.desk.search.search_link', {
    doctype,
    txt: meta.translated_doctype ? words : [...words].join('%'),
    filters: toFrappeFilters(filters ?? {}),
    page_length: limit,
  });
  const options = results.map(({ value, label }) => ({
    label: label || value,
    value,
  }));
  if (!groupBy) {
    return options;
  }

  const groups = await getFieldValues(schemaName, results, groupBy);
  return options.map((option) => ({ ...option, group: groups[option.value] }));
}

/** Each record's display field value by name, e.g. an address's text, for a schema that has one. */
export async function getLinkLabels(
  schemaName: string,
  names: string[]
): Promise<Record<string, string>> {
  const field = getDocType(schemaName).schema.linkDisplayField;
  const records = names.map((value) => ({ value }));
  return field ? await getFieldValues(schemaName, records, field) : {};
}

/** A field's value of each record by name. */
async function getFieldValues(
  schemaName: string,
  records: SearchResult[],
  fieldname: string
): Promise<Record<string, string>> {
  if (!records.length) {
    return {};
  }

  const rows = await getDocuments(getDocType(schemaName).doctype, {
    fields: ['name', fieldname],
    filters: [['name', 'in', records.map(({ value }) => value)]],
    limit: records.length,
  });
  return Object.fromEntries(
    rows.map((row) => [String(row.name), String(row[fieldname] ?? '')])
  );
}
