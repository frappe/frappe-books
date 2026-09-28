import type {
  ColumnConfig,
  ListViewSettings,
  RenderData,
} from 'fyo/model/types';
import type { Field } from 'schemas/types';
import { fyo } from 'src/initFyo';

export type ListColumn = ColumnConfig | Field;

/** The list view's columns, or the name and quick edit fields without them. */
export function getListColumns(
  schemaName: string,
  listConfig?: ListViewSettings
): ListColumn[] {
  let columns = listConfig?.columns ?? [];
  if (columns.length === 0) {
    columns = fyo.schemaMap[schemaName]?.quickEditFields ?? [];
    columns = [...new Set(['name', ...columns])];
  }

  return columns
    .map((column) =>
      typeof column === 'object' ? column : fyo.getField(schemaName, column)
    )
    .filter(Boolean);
}

export function isField(column: ListColumn): column is Field {
  return !(column as ColumnConfig).display && !(column as ColumnConfig).badge;
}

export function formatColumnValue(row: RenderData, column: ListColumn): string {
  const value = row[column.fieldname];
  if (isField(column)) {
    return fyo.format(value, column);
  }

  return column.display?.(value, fyo) ?? '';
}
