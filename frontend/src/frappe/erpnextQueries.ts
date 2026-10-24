/**
 * ERPNext's `set_query` rules for the Link fields accessory mode shows, as
 * data: ERPNext's form scripts never run in /books. Each entry copies one
 * rule of ERPNext's Desk JS, named in its comment (paths under `erpnext/`),
 * so a drift check can compare the two.
 *
 * Values are Desk's: filters as `{ fieldname: value | [operator, value] }`
 * or `[[doctype, fieldname, operator, value]]`, and a whitelisted `query`
 * method. A string `eval:<expression>` anywhere is worked out as DocField
 * link_filters are: over `doc`, the document holding the field (the row of a
 * table field), `parent`, the row's document, and the boot's `frappe`.
 * A dict filter whose value comes out empty is left out, as Desk leaves out
 * an empty Link value.
 */

/** Desk's link filters: a dict, or a list of filters. */
export type DeskFilters = Record<string, unknown> | unknown[][];

/** One `set_query` result. */
export interface LinkQuery {
  /** An `eval:` condition: a rule of cases applies its first case that holds. */
  when?: string;
  query?: string;
  filters?: DeskFilters;
}

export type LinkQueryRule = LinkQuery | LinkQuery[];

/** Rules by ERPNext doctype, then `fieldname`, or `table.fieldname` for a row's field. */
export const ERPNEXT_QUERIES: Record<
  string,
  Record<string, LinkQueryRule>
> = {};
