import { call } from 'src/web/api';
import type { Placements } from './schema';

/** The DocField properties /books reads. Custom fields and property setters are applied. */
export interface DocField {
  fieldname: string;
  fieldtype: string;
  label?: string;
  options?: string;
  default?: string;
  placeholder?: string;
  description?: string;
  reqd?: number;
  read_only?: number;
  hidden?: number;
  set_only_once?: number;
  non_negative?: number;
  max_value?: number;
  precision?: string;
  no_copy?: number;
  in_list_view?: number;
  is_custom_field?: number;
  permlevel?: number;
  is_virtual?: number;
  depends_on?: string;
  read_only_depends_on?: string;
  mandatory_depends_on?: string;
  /** JSON of `[doctype, fieldname, operator, value]` filters a Link's search applies. */
  link_filters?: string;
}

export interface DocPerm {
  role: string;
  permlevel?: number;
  read?: number;
  write?: number;
}

/** A DocType state: the colour of a `status` option. */
export interface DocTypeState {
  title: string;
  color: string;
}

export interface DocTypeMeta {
  name: string;
  module?: string;
  fields: DocField[];
  permissions: DocPerm[];
  states?: DocTypeState[];
  autoname?: string;
  naming_rule?: string;
  title_field?: string;
  /** Desk's links show the record's title field instead of its name. */
  show_title_field_in_link?: number;
  sort_field?: string;
  /** Comma separated fieldnames that search matches besides the name. */
  search_fields?: string;
  show_name_in_global_search?: number;
  istable?: number;
  issingle?: number;
  is_submittable?: number;
  is_tree?: number;
  /** Frappe searches a translated doctype's names in Python, where `%` is literal. */
  translated_doctype?: number;
}

/** Where accessory mode forms put the ERPNext fields that have no Books position. */
export interface AccessoryLayoutMeta {
  /** The end tab of each custom field, by doctype and fieldname: `custom`, `other` or an app's title. */
  tabs: Record<string, Record<string, string> | undefined>;
  /** Installed apps' titles in install order, which orders the app tabs. */
  app_titles: string[];
  /** Fields More details shows, by form doctype, then table fieldname ('' for the document's own). */
  picks: Record<string, Record<string, string[] | undefined> | undefined>;
}

/** What /books builds its forms from: the meta of each doctype and its tables, and custom field placements. */
export interface BooksMeta {
  metas: DocTypeMeta[];
  /** Where Books Custom Forms put custom fields, by doctype and fieldname. */
  placements: Record<string, Placements | undefined>;
  /** The form scripts apps add with the `books_doctype_js` hook, by doctype. */
  scripts?: Record<string, string>;
  /** In accessory mode, with the Books doctypes whose positions lay out the ERPNext ones. */
  accessory?: AccessoryLayoutMeta;
}

/**
 * The meta of the doctypes, as Frappe's getdoctype sends it, in one request.
 * In accessory mode, `layouts` are the Books twins that lay out the ERPNext `doctypes`.
 */
export async function getBooksMeta(
  doctypes: string[],
  layouts?: string[]
): Promise<BooksMeta> {
  return await call<BooksMeta>('frappe_books.meta.get_books_meta', {
    doctypes,
    layouts,
  });
}
