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
}

/**
 * Load a list's rows for its base and active filters. Returns undefined when
 * a newer load started before this one finished.
 */
export async function loadListData(
  fyo: Fyo,
  list: ListState,
  filters?: QueryFilter
): Promise<{ rows: RenderData[]; appliedFilters: QueryFilter } | undefined> {
  if (filters !== undefined) list.activeFilters = cloneDeep(toRaw(filters));
  const requestId = ++list.requestId;
  const appliedFilters = mergeQueryFilters(
    cloneDeep(toRaw(list.filters)),
    cloneDeep(toRaw(list.activeFilters))
  );
  const rows = await getListRows(fyo, list.schemaName, appliedFilters);
  if (requestId !== list.requestId) return;
  return { rows, appliedFilters };
}

async function getListRows(
  fyo: Fyo,
  schemaName: string,
  filters: QueryFilter
): Promise<RenderData[]> {
  const orderBy = fyo.db.fieldMap[schemaName].date
    ? ['date', 'created']
    : ['created'];
  const schema = fyo.schemaMap[schemaName];
  const rows = await fyo.db.getAll(schemaName, {
    fields: ['*'],
    filters,
    orderBy,
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
