import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import type { QueryFilter } from 'utils/db/types';
import { getCount, getDocuments, type Filter } from './api';
import { getDocType } from './doctypes';
import { toDocValues } from './values';

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
  const { doctype, schema } = getDocType(schemaName);
  const filters = toFrappeFilters(page.filters);
  const orFilters = toFrappeFilters(page.orFilters);
  const hasDate = schema.fields.some(({ fieldname }) => fieldname === 'date');
  const [rows, total] = await Promise.all([
    getDocuments(doctype, {
      fields: ['*'],
      filters: combineFilters(filters, orFilters),
      orderBy: hasDate ? 'date desc, creation desc' : 'creation desc',
      start: page.start,
      limit: page.limit,
    }),
    getCount(doctype, filters, orFilters),
  ]);
  const getSchema = (target: string) => getDocType(target).schema;
  return {
    rows: rows.map((row) => ({
      ...toDocValues(schema, row, fyo, getSchema),
      schema,
    })) as RenderData[],
    total,
  };
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
