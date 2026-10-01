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
  fields: DocField[];
  permissions: DocPerm[];
  states?: DocTypeState[];
  autoname?: string;
  naming_rule?: string;
  title_field?: string;
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

/** What /books builds its forms from: the meta of each doctype and its tables, and custom field placements. */
export interface BooksMeta {
  metas: DocTypeMeta[];
  /** Where Books Custom Forms put custom fields, by doctype and fieldname. */
  placements: Record<string, Placements | undefined>;
}

/** The meta of the doctypes, as Frappe's getdoctype sends it, in one request. */
export async function getBooksMeta(doctypes: string[]): Promise<BooksMeta> {
  return await call<BooksMeta>('frappe_books.meta.get_books_meta', {
    doctypes,
  });
}
