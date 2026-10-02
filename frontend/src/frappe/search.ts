import { groupBy, mapValues } from 'lodash';
import { ModelNameEnum } from 'models/types';
import { call } from 'src/web/api';
import { getAllDocuments, type DocValues } from './api';
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
  { doctype, meta, schema, Model }: FrappeDocType,
  parent?: string
) {
  const searchFields =
    Model.presentation.paletteFields ?? getSearchFields(schema.name);
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

/** Each schema's number series prefixes; every name a series gives starts with its prefix. */
export async function getSeriesPrefixes(): Promise<Record<string, string[]>> {
  const { doctype } = getDocType(ModelNameEnum.NumberSeries);
  const series = await getAllDocuments(doctype, {
    fields: ['name', 'reference_type'],
  });
  return mapValues(groupBy(series, 'reference_type'), (rows) =>
    rows.map(({ name }) => String(name))
  );
}

/**
 * Up to `limit` documents whose search fields hold the letters of the search
 * word of `text` in order, as Frappe's search finds them. Table rows come with
 * their parent.
 */
export function searchDocuments(
  searchable: Searchable,
  text: string,
  limit: number,
  seriesPrefixes: string[] = []
): Promise<DocValues[]> {
  const word = getSearchWord(searchable, text, seriesPrefixes);
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

/**
 * The longest word of `text` that does not start a word of the schema name or
 * a number series prefix: every document matches those in the palette, so
 * `Karen invoice` and `SINV 1001` send `Karen` and `1001` for invoices.
 */
function getSearchWord(
  { schemaName }: Searchable,
  text: string,
  seriesPrefixes: string[]
): string {
  const typeWords = [...schemaName.split(/(?=[A-Z])/), ...seriesPrefixes].map(
    (typeWord) => typeWord.toLowerCase()
  );
  const isTypeWord = (word: string) =>
    typeWords.some((typeWord) => typeWord.startsWith(word.toLowerCase()));
  const words = text.split(/\s+/);
  const recordWords = words.filter((word) => !isTypeWord(word));
  return (recordWords.length ? recordWords : words).reduce((longest, word) =>
    word.length > longest.length ? word : longest
  );
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
