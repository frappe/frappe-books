import type { Filter } from './api';
import { getCompanyRow } from './companyRow';
import { evaluateExpression, type EvalDoc } from './dependsOn';
import { getDocType } from './doctypes';
import type { FrappeDoc } from './document';
import {
  ERPNEXT_QUERIES,
  type DeskFilters,
  type LinkQuery,
  type LinkQueryRule,
} from './erpnextQueries';
import type { LinkSearch } from './link';
import { getAccessoryCompany } from './mode';

interface Context {
  doc: EvalDoc;
  parent: EvalDoc | null;
}

type LinkFilter = [string, string, string, unknown];

const failed = new Set<string>();

/**
 * How the Link `fieldname` of `doc` searches in accessory mode, as Desk's link control
 * works it out: ERPNext's `set_query` rule for the field, then the DocField's
 * link_filters over its filters. Undefined when ERPNext has neither.
 */
export function getERPNextLinkSearch(
  fieldname: string,
  doc: FrappeDoc
): LinkSearch | undefined {
  const rule = getRule(fieldname, doc);
  const linkFilters = getLinkFilters(fieldname, doc);
  if (!rule && !linkFilters) {
    return undefined;
  }

  const context = getContext(fieldname, doc);
  const { query, filters } = rule ? resolveRule(rule, context) : {};
  return {
    query,
    filters: linkFilters
      ? withLinkFilters(filters, parseLinkFilters(linkFilters, context))
      : (filters ?? null),
  };
}

/** A search's filters as a list, e.g. for the values of a record made from the link. */
export function toFilterList(filters: LinkSearch['filters']): Filter[] | null {
  if (!filters || Array.isArray(filters)) {
    return filters as Filter[] | null;
  }

  return Object.entries(filters).map(([fieldname, value]) =>
    Array.isArray(value)
      ? [fieldname, value[0] as string, value[1]]
      : [fieldname, '=', value]
  );
}

/**
 * The field's rule; a row's is keyed by its table, as `frm.set_query(field, table)` sets it.
 * A field kept in a per-company row searches as that row's field.
 */
function getRule(fieldname: string, doc: FrappeDoc): LinkQueryRule | undefined {
  const table = doc.fieldMap[fieldname]?.companyTable;
  if (table) {
    const { doctype } = getDocType(doc.schemaName);
    return ERPNEXT_QUERIES[doctype]?.[`${table}.${fieldname}`];
  }

  const { parentdoc, parentFieldname } = doc;
  if (parentdoc) {
    const { doctype } = getDocType(parentdoc.schemaName);
    return ERPNEXT_QUERIES[doctype]?.[`${parentFieldname}.${fieldname}`];
  }

  return ERPNEXT_QUERIES[getDocType(doc.schemaName).doctype]?.[fieldname];
}

function getLinkFilters(fieldname: string, doc: FrappeDoc): string | undefined {
  const docfield = getDocType(doc.schemaName).meta.fields.find(
    (field) => field.fieldname === fieldname
  );
  return docfield?.link_filters && docfield.link_filters !== '[]'
    ? docfield.link_filters
    : undefined;
}

/** What a rule reads; a per-company row's field reads the row, a new one only its company. */
function getContext(fieldname: string, doc: FrappeDoc): Context {
  const table = doc.fieldMap[fieldname]?.companyTable;
  if (table) {
    const row = getCompanyRow(doc, table);
    const company = getAccessoryCompany();
    return { doc: row?.getEvalDoc() ?? { company }, parent: doc.getEvalDoc() };
  }

  return {
    doc: doc.getEvalDoc(),
    parent: doc.parentdoc?.getEvalDoc() ?? null,
  };
}

/** The first case of the rule that holds, its values worked out. */
export function resolveRule(rule: LinkQueryRule, context: Context): LinkQuery {
  const cases = Array.isArray(rule) ? rule : [rule];
  const found = cases.find(({ when }) => !when || resolve(when, context));
  if (!found) {
    return {};
  }

  return {
    query: found.query,
    filters: found.filters && resolveFilters(found.filters, context),
  };
}

/** Values worked out; a dict leaves out empty ones, as Desk's `set_nulls` does. */
function resolveFilters(filters: DeskFilters, context: Context): DeskFilters {
  if (Array.isArray(filters)) {
    return filters.map((filter) => resolve(filter, context) as unknown[]);
  }

  const resolved = Object.entries(filters)
    .map(([fieldname, value]) => [fieldname, resolve(value, context)])
    .filter(([, value]) => !isEmpty(value));
  return Object.fromEntries(resolved);
}

/** A value with its `eval:` strings worked out, in arrays too. */
function resolve(value: unknown, context: Context): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolve(item, context));
  }

  if (typeof value === 'string' && value.startsWith('eval:')) {
    return evaluate(value.slice(5), context);
  }

  return value;
}

/** An expression's value; one that fails is left out, and logged once. */
function evaluate(source: string, { doc, parent }: Context): unknown {
  try {
    return evaluateExpression(source, doc, parent);
  } catch (error) {
    if (!failed.has(source)) {
      failed.add(source);
      console.error(`Leaving out a link filter that failed: ${source}`, error);
    }

    return undefined;
  }
}

/** Desk's `parse_filters`: link_filters by fieldname, as `[operator, value]`. */
function parseLinkFilters(
  linkFilters: string,
  context: Context
): Record<string, [string, unknown]> {
  const filters = JSON.parse(linkFilters) as LinkFilter[];
  return Object.fromEntries(
    filters.map(([, fieldname, operator, value]) => [
      fieldname,
      [operator, resolve(value, context)],
    ])
  );
}

/**
 * Desk's `set_custom_query`: link_filters replace the rule's filters on
 * their fields. A list keeps the rule's filters on other fields.
 */
function withLinkFilters(
  filters: DeskFilters | undefined,
  linkFilters: Record<string, [string, unknown]>
): DeskFilters {
  if (!Array.isArray(filters)) {
    return { ...filters, ...linkFilters };
  }

  const fieldnames = Object.keys(linkFilters);
  return filters
    .filter((filter) => !fieldnames.includes(filter.at(-3) as string))
    .concat(
      Object.entries(linkFilters).map(([fieldname, filter]) => [
        fieldname,
        ...filter,
      ])
    );
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
