import { call } from 'src/web/api';
import type { DocValues } from './api';
import { getDocType, getFrappeModels } from './doctypes';
import { getSearchFields } from './registry';

/** A schema whose documents the search palette finds. */
export interface Searchable {
  schemaName: string;
  doctype: string;
  /** The name and the DocType's search fields, as the palette shows them. */
  fields: string[];
  isSubmittable: boolean;
}

/**
 * The searchable schemas, by schema name: documents whose DocType names
 * search fields or shows their name in search, as the server indexes them.
 */
export function getSearchables(): Searchable[] {
  return getFrappeModels()
    .map(([schemaName]) => getDocType(schemaName))
    .filter(
      ({ meta }) =>
        !meta.istable &&
        !meta.issingle &&
        (!!meta.search_fields || !!meta.show_name_in_global_search)
    )
    .map(({ doctype, meta, schema }) => ({
      schemaName: schema.name,
      doctype,
      fields: ['name', ...getSearchFields(schema.name)],
      isSubmittable: !!meta.is_submittable,
    }))
    .sort((a, b) => (a.schemaName < b.schemaName ? -1 : 1));
}

/** Documents of `doctypes` that match `text`, best first, from the server's search index. */
export function searchDocuments(
  text: string,
  doctypes: string[]
): Promise<DocValues[]> {
  return call<DocValues[]>('frappe_books.search.search', { text, doctypes });
}
