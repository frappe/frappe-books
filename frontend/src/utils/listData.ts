import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import type { QueryFilter } from 'utils/db/types';
import { toRaw } from 'vue';
import { mergeQueryFilters } from './filterQuery';

export interface ListState {
  schemaName: string;
  filters: QueryFilter;
  activeFilters: QueryFilter;
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
  filters?: QueryFilter
): Promise<
  { rows: RenderData[]; total: number; appliedFilters: QueryFilter } | undefined
> {
  if (filters !== undefined) {
    list.activeFilters = cloneDeep(toRaw(filters));
    list.pageStart = 0;
  }
  const requestId = ++list.requestId;
  const appliedFilters = mergeQueryFilters(
    cloneDeep(toRaw(list.filters)),
    cloneDeep(toRaw(list.activeFilters))
  );
  const [total, rows] = await Promise.all([
    fyo.db.count(list.schemaName, { filters: appliedFilters }),
    getListRows(fyo, list, appliedFilters),
  ]);
  if (requestId !== list.requestId) return;
  return { rows, total, appliedFilters };
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
  fyo.db.observer.on(`delete:${schemaName}`, listener);
  fyo.doc.observer.on(`rename:${schemaName}`, listener);
}
