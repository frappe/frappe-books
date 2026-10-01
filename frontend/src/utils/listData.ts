import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import type { QueryFilter } from 'utils/db/types';
import { getFrappeListPage, type ListSort } from 'src/frappe/list';
import { getSchema } from 'src/frappe/registry';
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
  sort?: ListSort | null;
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
  const { rows, total } = await getFrappeListPage(fyo, list.schemaName, {
    filters: appliedFilters,
    orFilters: list.orFilters,
    start: list.pageStart,
    limit: list.pageLength,
    sort: list.sort,
  });
  if (requestId !== list.requestId) return;
  return { rows, total, appliedFilters };
}

/** Call `listener` when documents shown in a list of `schemaName` change. */
export function onListChange(
  fyo: Fyo,
  schemaName: string,
  listener: () => Promise<void>
) {
  if (getSchema(schemaName)?.isSubmittable) {
    fyo.observer.on(`submit:${schemaName}`, listener);
    fyo.observer.on(`cancel:${schemaName}`, listener);
  }

  fyo.observer.on(`sync:${schemaName}`, listener);
  fyo.observer.on(`delete:${schemaName}`, listener);
  fyo.observer.on(`rename:${schemaName}`, listener);
}
