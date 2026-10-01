import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import type { QueryFilter } from 'utils/db/types';
import { getCount, getDocuments, type DocValues, type Filter } from './api';
import { getDocType, type FrappeDocType } from './doctypes';
import { toDocValues } from './values';

// Books' Submitted and Cancelled list filters, as the docstatus values they match.
const DOCSTATUS_FLAGS: Record<string, number[]> = {
  submitted: [1, 2],
  cancelled: [2],
};

export interface ListPage {
  filters: QueryFilter;
  /** Rows also have to match one of these, e.g. a search over several fields. */
  orFilters: QueryFilter;
  start: number;
  limit: number;
}

/** A page of a Frappe-backed list, newest first, and how many rows match in all. */
export async function getFrappeListPage(
  fyo: Fyo,
  schemaName: string,
  page: ListPage
): Promise<{ rows: RenderData[]; total: number }> {
  const docType = getDocType(schemaName);
  const filters = toFrappeFilters(page.filters);
  const orFilters = toFrappeFilters(page.orFilters);
  const [rows, total] = await Promise.all([
    getDocuments(docType.doctype, {
      fields: ['*'],
      filters: combineFilters(filters, orFilters),
      orderBy: getOrderBy(docType),
      start: page.start,
      limit: page.limit,
    }),
    getCount(docType.doctype, filters, orFilters),
  ]);
  return { rows: toRenderData(fyo, docType, rows), total };
}

/** Documents of a Frappe-backed schema by name, newest first, with the values forms show. */
export async function getFrappeRows(
  fyo: Fyo,
  schemaName: string,
  names: string[],
  fields: string[] = ['*']
): Promise<RenderData[]> {
  const docType = getDocType(schemaName);
  const rows = await getDocuments(docType.doctype, {
    fields,
    filters: [['name', 'in', names]],
    orderBy: 'creation desc',
    limit: names.length,
  });
  return toRenderData(fyo, docType, rows);
}

function toRenderData(
  fyo: Fyo,
  { schema }: FrappeDocType,
  rows: DocValues[]
): RenderData[] {
  const getSchema = (target: string) => getDocType(target).schema;
  return rows.map((row) => ({
    ...toDocValues(schema, row, fyo, getSchema),
    schema,
  })) as RenderData[];
}

/** By the DocType's sort field when it sets one, else by the date; newest first. */
function getOrderBy({ meta, schema }: FrappeDocType): string {
  const fieldnames = schema.fields.map(({ fieldname }) => fieldname);
  const sortField = [meta.sort_field, 'date'].find(
    (fieldname) =>
      fieldname && fieldname !== 'creation' && fieldnames.includes(fieldname)
  );
  return sortField ? `${sortField} desc, creation desc` : 'creation desc';
}

/** Frappe filters for a Books list filter whose fields are Frappe fieldnames. */
export function toFrappeFilters(query: QueryFilter): Filter[] {
  const filters: Filter[] = [];
  for (const [fieldname, value] of Object.entries(query)) {
    const conditions = Array.isArray(value) ? value : ['=', value];
    for (let index = 0; index < conditions.length; index += 2) {
      const operator = String(conditions[index]);
      filters.push(toFrappeFilter(fieldname, operator, conditions[index + 1]));
    }
  }

  return filters;
}

function toFrappeFilter(
  fieldname: string,
  operator: string,
  value: unknown
): Filter {
  if (operator === 'is null' || operator === 'is not null') {
    return [fieldname, 'is', operator === 'is null' ? 'not set' : 'set'];
  }

  if (fieldname in DOCSTATUS_FLAGS) {
    const isSet = (operator === '=') === Boolean(Number(value));
    return ['docstatus', isSet ? 'in' : 'not in', DOCSTATUS_FLAGS[fieldname]];
  }

  if (operator === 'includes') {
    return [fieldname, 'like', `%${String(value)}%`];
  }

  return [fieldname, operator, typeof value === 'boolean' ? +value : value];
}

/** All of `filters`, and one of `orFilters` when there are any. */
function combineFilters(filters: Filter[], orFilters: Filter[]): Filter[] {
  if (!orFilters.length) {
    return filters;
  }

  const anyOf = orFilters.length === 1 ? orFilters[0] : join(orFilters, 'or');
  return join([...filters, anyOf], 'and');
}

/** Frappe's nested filter form: `[filter, 'and', filter, ...]`. */
function join(filters: Filter[], operator: 'and' | 'or'): Filter[] {
  return filters.flatMap((filter, index) =>
    index ? [operator, filter] : [filter]
  ) as Filter[];
}
