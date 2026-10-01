import type { Fyo } from 'fyo';
import type { RenderData } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { getFrappeListPage, type ListSort } from 'src/frappe/list';
import { getSchema } from 'src/frappe/registry';

export interface ListState {
  schemaName: string;
  filters: Filter[];
  activeFilters: Filter[];
  /** Rows match at least one of these, e.g. a search over several fields. */
  orFilters: Filter[];
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
  filters?: Filter[],
  orFilters: Filter[] = []
): Promise<
  { rows: RenderData[]; total: number; appliedFilters: Filter[] } | undefined
> {
  if (filters !== undefined) {
    list.activeFilters = filters;
    list.orFilters = orFilters;
    list.pageStart = 0;
  }
  const requestId = ++list.requestId;
  const appliedFilters = [...list.filters, ...list.activeFilters];
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
