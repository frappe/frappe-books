import { call } from 'src/web/api';
import type { DocValues } from './api';
import { getDocType, getFrappeModels, type FrappeDocType } from './doctypes';
import { getSearchFields } from './registry';

/** A schema whose documents the search palette finds by its DocType's search fields. */
export interface Searchable {
  schemaName: string;
  doctype: string;
  /** The name and the search fields; a table row is found by its search fields only. */
  fields: string[];
  /** The doctypes whose tables hold a table row's doctype. */
  parents: string[];
  isChild: boolean;
  isSubmittable: boolean;
  isTranslated: boolean;
}

/**
 * The searchable schemas, by schema name: those with search fields, and
 * documents whose DocType shows their name in search.
 */
export function getSearchables(): Searchable[] {
  const searchables = new Map<string, Searchable>();
  for (const [schemaName] of getFrappeModels()) {
    const docType = getDocType(schemaName);
    addSearchable(searchables, docType);
    for (const table of Object.values(docType.tables)) {
      addSearchable(searchables, table!, docType.doctype);
    }
  }

  return [...searchables.values()].sort((a, b) =>
    a.schemaName < b.schemaName ? -1 : 1
  );
}

function addSearchable(
  searchables: Map<string, Searchable>,
  { doctype, meta, schema }: FrappeDocType,
  parent?: string
) {
  const searchFields = getSearchFields(schema.name);
  const isChild = !!meta.istable;
  const known = searchables.get(schema.name);
  if (known) {
    known.parents.push(...(parent ? [parent] : []));
    return;
  }

  if (!searchFields.length && (isChild || !meta.show_name_in_global_search)) {
    return;
  }

  searchables.set(schema.name, {
    schemaName: schema.name,
    doctype,
    fields: isChild ? searchFields : ['name', ...searchFields],
    parents: parent ? [parent] : [],
    isChild,
    isSubmittable: !!meta.is_submittable,
    isTranslated: !!meta.translated_doctype,
  });
}

/**
 * Up to `limit` documents whose search fields hold the letters of the longest
 * word of `text` in order, as Frappe's search finds them. Table rows come with
 * their parent.
 */
export function searchDocuments(
  searchable: Searchable,
  text: string,
  limit: number
): Promise<DocValues[]> {
  const word = text
    .split(/\s+/)
    .reduce((longest, part) => (part.length > longest.length ? part : longest));
  // Frappe matches `%txt%`; a `%` between letters matches them in order.
  // Translated doctypes match `txt` in Python, where `%` is literal.
  const pattern = searchable.isTranslated ? word : [...word].join('%');
  if (searchable.isChild) {
    return searchRows(searchable, pattern, limit);
  }

  const { doctype, fields, isSubmittable } = searchable;
  return call<DocValues[]>('frappe.desk.search.search_widget', {
    doctype,
    txt: pattern,
    page_length: limit,
    filter_fields: isSubmittable ? [...fields, 'docstatus'] : fields,
    as_dict: true,
  });
}

/** Frappe's search needs a parent doctype for table rows, so their rows are listed per parent. */
async function searchRows(
  { doctype, fields, parents }: Searchable,
  pattern: string,
  limit: number
): Promise<DocValues[]> {
  const pages = await Promise.all(
    parents.map((parent) =>
      call<DocValues[]>('frappe.client.get_list', {
        doctype,
        parent,
        fields: ['name', ...fields, 'parent', 'parenttype'],
        filters: [['parenttype', '=', parent]],
        or_filters: fields.map((field) => [field, 'like', `%${pattern}%`]),
        order_by: 'idx',
        limit_page_length: limit,
      })
    )
  );
  return pages.flat();
}
