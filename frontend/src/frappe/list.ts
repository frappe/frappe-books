import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import {
  getCount,
  getDocuments,
  getList,
  type DocValues,
  type Filter,
} from './api';
import { getDocType, type FrappeDocType } from './doctypes';
import { toDocValues } from './values';

/** A column the list is ordered by in place of its default order. */
export interface ListSort {
  fieldname: string;
  direction: 'asc' | 'desc';
}

export interface ListPage {
  filters: Filter[];
  /** Rows also have to match one of these, e.g. a search over several fields. */
  orFilters: Filter[];
  start: number;
  limit: number;
  sort?: ListSort | null;
}

/** A page of a Frappe-backed list, newest first unless sorted, and how many rows match in all. */
export async function getFrappeListPage(
  fyo: Fyo,
  schemaName: string,
  page: ListPage
): Promise<{ rows: RenderData[]; total: number }> {
  const docType = getDocType(schemaName);
  const { filters, orFilters } = page;
  const [rows, total] = await Promise.all([
    getList(docType.doctype, {
      fields: ['*'],
      filters,
      orFilters,
      orderBy: page.sort ? getSortOrderBy(page.sort) : getOrderBy(docType),
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
export function getOrderBy({ meta, schema }: FrappeDocType): string {
  const fieldnames = schema.fields.map(({ fieldname }) => fieldname);
  const sortField = [meta.sort_field, 'date'].find(
    (fieldname) =>
      fieldname && fieldname !== 'creation' && fieldnames.includes(fieldname)
  );
  return sortField ? `${sortField} desc, creation desc` : 'creation desc';
}

/** By the picked column, newest first among equal values. */
export function getSortOrderBy({ fieldname, direction }: ListSort): string {
  const order = `${fieldname} ${direction}`;
  return fieldname === 'creation' ? order : `${order}, creation desc`;
}

/** Whether a list can be ordered by the field: a column its DocType stores. */
export function isSortableField(
  schemaName: string,
  fieldname: string
): boolean {
  const { meta, schema } = getDocType(schemaName);
  const docField = meta.fields.find((field) => field.fieldname === fieldname);
  return (
    !docField?.is_virtual &&
    schema.fields.some((field) => field.fieldname === fieldname)
  );
}
