import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import type { QueryFilter } from 'utils/db/types';
import { isFrappeBacked } from 'src/frappe/doctypes';
import { getFrappeListPage } from 'src/frappe/list';
import { toRaw } from 'vue';
import { mergeQueryFilters } from './filterQuery';

export interface ListState {
  schemaName: string;
  filters: QueryFilter;
  activeFilters: QueryFilter;
  /** Rows match at least one of these, e.g. a search over several fields. */
  orFilters: QueryFilter;
  requestId: number;
  pageStart: number;
  pageLength: number;
}

/**
 * Load a page of a list's rows and the row count for its base and active
 * filters. New active filters go back to the first page. Returns undefined
 * when a newer load started before this one finished.
 */
export async function loadListData(
  fyo: Fyo,
  list: ListState,
  filters?: QueryFilter,
  orFilters: QueryFilter = {}
): Promise<
  { rows: RenderData[]; total: number; appliedFilters: QueryFilter } | undefined
> {
  if (filters !== undefined) {
    list.activeFilters = cloneDeep(toRaw(filters));
    list.orFilters = cloneDeep(toRaw(orFilters));
    list.pageStart = 0;
  }
  const requestId = ++list.requestId;
  const appliedFilters = mergeQueryFilters(
    cloneDeep(toRaw(list.filters)),
    cloneDeep(toRaw(list.activeFilters))
  );
  const { rows, total } = await getListPage(fyo, list, appliedFilters);
  if (requestId !== list.requestId) return;
  return { rows, total, appliedFilters };
}

async function getListPage(fyo: Fyo, list: ListState, filters: QueryFilter) {
  if (isFrappeBacked(list.schemaName)) {
    return await getFrappeListPage(fyo, list.schemaName, {
      filters,
      orFilters: list.orFilters,
      start: list.pageStart,
      limit: list.pageLength,
    });
  }

  const [total, rows] = await Promise.all([
    fyo.db.count(list.schemaName, { filters, orFilters: list.orFilters }),
    getListRows(fyo, list, filters),
  ]);
  return { rows, total };
}

async function getListRows(
  fyo: Fyo,
  list: ListState,
  filters: QueryFilter
): Promise<RenderData[]> {
  const orderBy = fyo.db.fieldMap[list.schemaName].date
    ? ['date', 'created']
    : ['created'];
  const schema = fyo.schemaMap[list.schemaName];
  const rows = await fyo.db.getAll(list.schemaName, {
    fields: ['*'],
    filters,
    orFilters: list.orFilters,
    orderBy,
    offset: list.pageStart,
    limit: list.pageLength,
  });
  return rows.map((row) => ({ ...row, schema })) as RenderData[];
}

/** Call `listener` when documents shown in a list of `schemaName` change. */
export function onListChange(
  fyo: Fyo,
  schemaName: string,
  listener: () => Promise<void>
) {
  if (fyo.schemaMap[schemaName]?.isSubmittable) {
    fyo.doc.observer.on(`submit:${schemaName}`, listener);
    fyo.doc.observer.on(`cancel:${schemaName}`, listener);
  }

  fyo.doc.observer.on(`sync:${schemaName}`, listener);
  // A Frappe-backed document announces its own deletion; the bridge announces the rest.
  const deletions = isFrappeBacked(schemaName) ? fyo.doc.observer : fyo.db.observer;
  deletions.on(`delete:${schemaName}`, listener);
  fyo.doc.observer.on(`rename:${schemaName}`, listener);
}
