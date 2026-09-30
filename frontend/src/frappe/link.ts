import { call } from 'src/web/api';
import type { QueryFilter } from 'utils/db/types';
import { getDocType } from './doctypes';
import { toFrappeFilters } from './list';

type SearchResult = { value: string; label?: string };

/**
 * Link options from Frappe's link search. Letters typed are matched in
 * order, e.g. `rce` finds `Rice`, as Books' link search always has.
 */
export async function searchFrappeLink(
  schemaName: string,
  text: string,
  filters: QueryFilter | null,
  limit: number
): Promise<{ label: string; value: string }[]> {
  const { doctype, meta } = getDocType(schemaName);
  const words = text.trim();
  const results = await call<SearchResult[]>('frappe.desk.search.search_link', {
    doctype,
    txt: meta.translated_doctype ? words : [...words].join('%'),
    filters: toFrappeFilters(filters ?? {}),
    page_length: limit,
  });
  return results.map(({ value, label }) => ({ label: label || value, value }));
}
