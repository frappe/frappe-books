import type {
  ColumnConfig,
  ListViewSettings,
  RenderData,
} from 'fyo/model/types';
import type { Field } from 'schemas/types';
import { getDocType } from 'src/frappe/doctypes';
import { isAccessoryMode } from 'src/frappe/mode';
import { getFields, getSchema } from 'src/frappe/registry';
import { isNumeric } from 'src/utils';
import { fyo } from 'src/initFyo';

export type ListColumn = ColumnConfig | Field;

/** What an empty list shows: the model's words, else `fallback`. */
export function getEmptyState(
  listConfig: ListViewSettings | undefined,
  isFiltered: boolean,
  fallback: { title: string; description?: string; createLabel: string }
): { title: string; description?: string; createLabel: string } {
  const own = listConfig?.emptyState;
  if (!own) {
    return fallback;
  }

  // A model's filtered title says it all, as the design's lists do.
  if (isFiltered) {
    return own.filteredTitle
      ? { ...fallback, title: own.filteredTitle, description: undefined }
      : fallback;
  }

  return {
    title: own.title,
    description: own.description,
    createLabel: own.createLabel ?? fallback.createLabel,
  };
}

/**
 * The list view's columns, or the name and quick edit fields without them.
 * Columns the DocType lacks are left out; an ERPNext DocType left with only
 * its name shows its in_list_view fields.
 */
export function getListColumns(
  schemaName: string,
  listConfig?: ListViewSettings
): ListColumn[] {
  let columns = listConfig?.columns ?? [];
  if (columns.length === 0) {
    columns = getSchema(schemaName)?.quickEditFields ?? [];
    columns = [...new Set(['name', ...columns])];
  }

  // A DocType whose links show titles, like ERPNext's hash-named batches, lists them too.
  const { meta } = getDocType(schemaName);
  const title = meta.show_title_field_in_link ? meta.title_field : undefined;
  const shown = columns.flatMap((column): ListColumn[] => {
    if (typeof column === 'object') {
      return [column];
    }

    const fieldname = column === 'name' && title ? title : column;
    return getFields(schemaName, [fieldname]);
  });
  if (
    !isAccessoryMode() ||
    shown.some((column) => column.fieldname !== 'name')
  ) {
    return shown;
  }

  const listed = meta.fields.filter((field) => field.in_list_view);
  return [
    ...shown,
    ...getFields(
      schemaName,
      listed.map((f) => f.fieldname)
    ),
  ];
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
