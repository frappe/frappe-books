import type { Filter } from './api';
import { getCompanyRow } from './companyRow';
import { evaluateExpression, type EvalDoc } from './dependsOn';
import { getDocType } from './doctypes';
import type { FrappeDoc } from './document';
import { getScriptQuery, type LinkQuery } from './formScripts';
import type { DeskFilters, LinkRule, LinkSearch } from './link';
import { getAccessoryCompany, isAccessoryMode } from './mode';

interface Context {
  doc: EvalDoc;
  parent: EvalDoc | null;
}

type LinkFilter = [string, string, string, unknown];

const failed = new Set<string>();
const rules = new Map<string, Record<string, LinkRule>>();

/** Keeps the link queries generated from the apps' Desk JS, by doctype. */
export function addLinkRules(
  queries: Record<string, Record<string, LinkRule>> = {}
) {
  for (const [doctype, byKey] of Object.entries(queries)) {
    rules.set(doctype, byKey);
  }
}

/**
 * How the Link `fieldname` of `doc` searches, as Desk's link control works it
 * out: a form script's `set_query` for the field, else the query generated
 * from the apps' Desk JS, then, in accessory mode, the DocField's link_filters
 * over its filters. Undefined when there is none of them.
 */
export async function getLinkSearch(
  fieldname: string,
  doc: FrappeDoc
): Promise<LinkSearch | undefined> {
  const found = await getQuery(fieldname, doc);
  const linkFilters = isAccessoryMode()
    ? getLinkFilters(fieldname, doc)
    : undefined;
  if (!found && !linkFilters) {
    return undefined;
  }

  const filters = found?.filters && withoutEmpty(found.filters);
  return {
    query: found?.query,
    filters: linkFilters
      ? withLinkFilters(
          filters,
          parseLinkFilters(linkFilters, getContext(fieldname, doc))
        )
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

/** The field's `set_query`, else its generated rule. */
async function getQuery(
  fieldname: string,
  doc: FrappeDoc
): Promise<LinkQuery | undefined> {
  const { form, key, row } = getQueryKey(fieldname, doc);
  return (
    (await getScriptQuery(form, key, row)) ??
    getRuleQuery(form.doctype, key, getContext(fieldname, doc))
  );
}

/**
 * The form the field's query is set on, and its key there: a row's is keyed
 * by its table, as `frm.set_query(field, table)` sets it. A field kept in a
 * per-company row searches as that row's field.
 */
function getQueryKey(
  fieldname: string,
  doc: FrappeDoc
): { form: FrappeDoc; key: string; row?: { cdt: string; cdn?: string } } {
  const table = doc.fieldMap[fieldname]?.companyTable;
  if (table) {
    const cdt = getTableDoctype(doc, table);
    const cdn = getCompanyRow(doc, table)?.name;
    return { form: doc, key: `${table}.${fieldname}`, row: { cdt, cdn } };
  }

  const { parentdoc, parentFieldname } = doc;
  if (parentdoc) {
    const row = { cdt: doc.doctype, cdn: doc.name };
    return { form: parentdoc, key: `${parentFieldname}.${fieldname}`, row };
  }

  return { form: doc, key: fieldname };
}

/** The generated rule of a form's field, worked out; none while a `when` value is not set. */
function getRuleQuery(
  doctype: string,
  key: string,
  context: Context
): LinkQuery | undefined {
  const rule = rules.get(doctype)?.[key];
  if (!rule || rule.when?.some((value) => !resolve(value, context))) {
    return undefined;
  }

  const filters =
    rule.filters && (resolve(rule.filters, context) as DeskFilters);
  return { query: rule.query, filters };
}

function getTableDoctype(doc: FrappeDoc, table: string): string {
  return getDocType(doc.schemaName).meta.fields.find(
    (field) => field.fieldname === table
  )!.options!;
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

/** A dict leaves out empty values, as Desk's `set_nulls` does. */
function withoutEmpty(filters: DeskFilters): DeskFilters {
  if (Array.isArray(filters)) {
    return filters;
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => !isEmpty(value))
  );
}

/** A value with its `eval:` strings worked out, in arrays and dicts too. */
function resolve(value: unknown, context: Context): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolve(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolve(item, context)])
    );
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
