import type { FieldType, RawValue } from 'schemas/types';
import { toColumnField, type ServerColumn } from 'reports/serverReport';
import type { ColumnField, ReportChart, SummaryItem } from 'reports/types';
import { call } from 'src/web/api';
import type { ERPNextFilter, FilterValues } from './types';

/** A row as ERPNext's report gives it; `__total` marks the total row Frappe adds. */
export type ERPNextRow = Record<string, RawValue | undefined> & {
  __total?: boolean;
};

export interface ERPNextReportResult {
  columns: ColumnField[];
  rows: ERPNextRow[];
  message: string;
  chart: ReportChart | null;
  summary: SummaryItem[];
}

interface RunResponse {
  columns: (ServerColumn & { hidden?: number })[];
  result: (ERPNextRow | RawValue[])[];
  message?: string | null;
  chart?: ReportChart | null;
  report_summary?: SummaryItem[] | null;
}

const NUMERIC_TYPES = ['Currency', 'Float', 'Int', 'Percent'];

/**
 * Run an ERPNext report as Desk does: the framework checks the report's
 * roles, and the Link filters' values against the user's permissions.
 */
export async function runERPNextReport(
  reportName: string,
  filters: FilterValues,
  definitions: ERPNextFilter[]
): Promise<ERPNextReportResult> {
  const response = await call<RunResponse>('frappe.desk.query_report.run', {
    report_name: reportName,
    filters,
    ignore_prepared_report: true,
    js_filters: definitions
      .filter(({ fieldtype }) => fieldtype === 'Link')
      .map(({ fieldname, fieldtype, options }) => ({
        fieldname,
        fieldtype,
        options,
      })),
  });

  return {
    columns: response.columns
      .filter(({ hidden }) => !hidden)
      .map(toERPNextColumn),
    rows: response.result.map((row) => toRow(row, response.columns)),
    message: response.message ?? '',
    chart: response.chart ?? null,
    summary: response.report_summary ?? [],
  };
}

/** Columns without a fieldtype are Data; numbers align right, as in Desk. */
function toERPNextColumn(column: ServerColumn): ColumnField {
  const fieldtype = (column.fieldtype || 'Data') as FieldType;
  return {
    ...toColumnField({ ...column, fieldtype }),
    align: NUMERIC_TYPES.includes(fieldtype) ? 'right' : 'left',
    options: column.options,
  };
}

/** Frappe adds its total row as a list of values, one per column, hidden ones included. */
function toRow(row: ERPNextRow | RawValue[], columns: ServerColumn[]) {
  if (!Array.isArray(row)) {
    return row;
  }

  const values = columns.map(({ fieldname }, index) => [fieldname, row[index]]);
  return { ...Object.fromEntries(values), __total: true } as ERPNextRow;
}
