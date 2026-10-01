import type {
  ColumnConfig,
  ListViewSettings,
  RenderData,
} from 'fyo/model/types';
import type { Field } from 'schemas/types';
import { getFields, getSchema } from 'src/frappe/registry';
import { isNumeric } from 'src/utils';
import { fyo } from 'src/initFyo';

export type ListColumn = ColumnConfig | Field;

/** The list view's columns, or the name and quick edit fields without them. */
export function getListColumns(
  schemaName: string,
  listConfig?: ListViewSettings
): ListColumn[] {
  let columns = listConfig?.columns ?? [];
  if (columns.length === 0) {
    columns = getSchema(schemaName)?.quickEditFields ?? [];
    columns = [...new Set(['name', ...columns])];
  }

  return columns.flatMap((column): ListColumn[] =>
    typeof column === 'object' ? [column] : getFields(schemaName, [column])
  );
}

/** Fixed tracks for dates, numbers and badges; text shares what is left. */
export function getColumnTrack(column: ListColumn): string {
  if ((column as ColumnConfig).badge) {
    return '7rem';
  }
  if (column.fieldtype === 'Date') {
    return '8rem';
  }
  if (isNumeric(column.fieldtype)) {
    return '9rem';
  }
  return 'minmax(0, 1fr)';
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
