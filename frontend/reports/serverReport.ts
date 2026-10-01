import { camelCase, mapKeys, snakeCase } from 'lodash';
import { FieldType, RawValue } from 'schemas/types';
import { toSchemaName } from 'src/frappe/registry';
import { isNumeric } from 'src/utils';
import { call } from 'src/web/api';
import { ColumnField } from './types';

/** Frappe measures report columns in pixels; the Books table in units of this width. */
const COLUMN_UNIT = 120;

export interface ServerColumn {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  options?: string;
  width?: number;
}

export type ServerRow = Record<string, RawValue | undefined>;
export type ServerFilters = Record<string, RawValue>;

export interface ServerReportResult {
  columns: ColumnField[];
  rows: ServerRow[];
}

/** Run a Script Report through the framework, which checks its permissions. */
export async function runServerReport(
  reportName: string,
  filters: ServerFilters
): Promise<ServerReportResult> {
  const { columns, result } = await call<{
    columns: ServerColumn[];
    result: ServerRow[];
  }>('frappe.desk.query_report.run', {
    report_name: reportName,
    filters: toServerFilters(filters),
    ignore_prepared_report: true,
  });
  return { columns: columns.map(toColumnField), rows: result };
}

/** Script Reports take Frappe's snake_case filter names. */
export function toServerFilters(filters: ServerFilters): ServerFilters {
  return mapKeys(filters, (_, key) => snakeCase(key));
}

export async function getServerDefaultFilters(
  reportName: string
): Promise<ServerFilters> {
  const defaults = await call<ServerFilters>(
    'frappe_books.reports.filters.get_default_filters',
    { report_name: reportName }
  );
  return mapKeys(defaults, (_, key) => camelCase(key));
}

export function toColumnField(column: ServerColumn): ColumnField {
  return {
    fieldname: column.fieldname,
    label: column.label,
    fieldtype: column.fieldtype,
    align: isNumeric(column.fieldtype) ? 'right' : 'left',
    width: (column.width ?? COLUMN_UNIT) / COLUMN_UNIT,
    target:
      column.fieldtype === 'Link' && column.options
        ? toSchemaName(column.options)
        : undefined,
  };
}

/** Script Reports separate groups of rows with an empty row. */
export function isBlankRow(row: ServerRow) {
  return Object.keys(row).length === 0;
}

interface ReportBoot {
  allowed_reports?: Record<string, { ref_doctype?: string } | undefined>;
  user?: { can_export?: string[] };
}

/**
 * Desk's rule: a report exports when the user can export its reference
 * doctype. Without a Frappe boot (tests and scripts), nothing is restricted.
 */
export function canExportReport(reportName: string): boolean {
  const boot = globalThis.window?.frappe?.boot as ReportBoot | undefined;
  if (!boot) {
    return true;
  }

  const doctype = boot.allowed_reports?.[reportName]?.ref_doctype;
  return !!doctype && !!boot.user?.can_export?.includes(doctype);
}

/** Desk lists the reports the user may open in the boot; without one, all open. */
export function canOpenReport(reportName: string): boolean {
  const boot = globalThis.window?.frappe?.boot as ReportBoot | undefined;
  return !boot || !!boot.allowed_reports?.[reportName];
}
