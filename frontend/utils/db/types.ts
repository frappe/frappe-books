/** List filters by fieldname: a value, or `[operator, value]`. */
export type QueryFilter = Record<
  string,
  boolean | string | null | (string | number | (string | number | null)[])[]
>;

/** A submitted document Frappe cancels along with the one it links to. */
export type LinkedDoc = { doctype: string; name: string; docstatus: number };
