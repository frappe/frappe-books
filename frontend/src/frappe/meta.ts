import { call } from 'src/web/api';

/** The DocField properties /books reads. Custom fields and property setters are applied. */
export interface DocField {
  fieldname: string;
  fieldtype: string;
  label?: string;
  options?: string;
  default?: string;
  placeholder?: string;
  reqd?: number;
  read_only?: number;
  hidden?: number;
  set_only_once?: number;
  non_negative?: number;
  no_copy?: number;
  only_select?: number;
  in_list_view?: number;
  is_custom_field?: number;
  permlevel?: number;
  depends_on?: string;
  read_only_depends_on?: string;
  mandatory_depends_on?: string;
}

export interface DocPerm {
  role: string;
  permlevel?: number;
  read?: number;
  write?: number;
}

export interface DocTypeMeta {
  name: string;
  fields: DocField[];
  permissions: DocPerm[];
  autoname?: string;
  naming_rule?: string;
  title_field?: string;
  sort_field?: string;
  /** Comma separated fieldnames that search matches besides the name. */
  search_fields?: string;
  istable?: number;
  issingle?: number;
  is_submittable?: number;
  is_tree?: number;
  /** Frappe searches a translated doctype's names in Python, where `%` is literal. */
  translated_doctype?: number;
}

const bundles = new Map<string, Promise<DocTypeMeta[]>>();

/** A doctype's meta, then the meta of each child doctype it holds. Loaded once per doctype. */
export function getMetaBundle(doctype: string): Promise<DocTypeMeta[]> {
  let bundle = bundles.get(doctype);
  if (!bundle) {
    bundle = loadMetaBundle(doctype);
    bundles.set(doctype, bundle);
    // A failed load is tried again next time.
    bundle.catch(() => bundles.delete(doctype));
  }

  return bundle;
}

/** Forgets a doctype's meta, e.g. after its form is customized. */
export function clearMeta(doctype: string) {
  bundles.delete(doctype);
}

async function loadMetaBundle(doctype: string): Promise<DocTypeMeta[]> {
  const { docs } = await call<{ docs: DocTypeMeta[] }>(
    'frappe.desk.form.load.getdoctype',
    { doctype, with_parent: 1 }
  );
  return docs;
}
