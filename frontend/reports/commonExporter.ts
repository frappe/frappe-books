import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { toSchemaName } from 'src/frappe/registry';
import { downloadFile } from 'src/utils/browser';
import { showToast } from 'src/utils/interactive';
import { getIsNullOrUndef } from 'utils';
import { generateCSV } from 'utils/csvParser';
import { Report } from './Report';
import { canExportReport } from './serverReport';
import { ExportExtension, ReportCell } from './types';

// Reports hold reference types as doctypes; files name them by schema, e.g. `SalesInvoice`.
const REFERENCE_FIELDNAMES = ['reference_type', 'referenceType'];

interface JSONExport {
  columns: { fieldname: string; label: string }[];
  rows: Record<string, unknown>[];
  filters: Record<string, string>;
  timestamp: string;
  reportName: string;
  softwareName: string;
  softwareVersion: string;
}

export default function getCommonExportActions(report: Report): Action[] {
  return getExportActions(report, exportReport);
}

/** CSV and JSON export actions, shown only when the user can export the report. */
export function getExportActions<T extends Report>(
  report: T,
  exporter: (extension: ExportExtension, report: T) => Promise<void>
): Action[] {
  if (!canExportReport(report.serverReportName)) {
    return [];
  }

  const exportExtension = ['csv', 'json'] as ExportExtension[];
  return exportExtension.map((ext) => ({
    group: t`Export`,
    label: ext.toUpperCase(),
    type: 'primary',
    action: async () => {
      await exporter(ext, report);
    },
  }));
}

export async function exportReport(
  extension: ExportExtension,
  report: Report
) {
  let data = '';

  if (extension === 'csv') {
    data = getCsvData(report);
  } else if (extension === 'json') {
    data = getJsonData(report);
  }

  if (!data.length) {
    return;
  }

  saveExportData(data, `${report.reportName}.${extension}`);
}

export function getJsonData(report: Report): string {
  const exportObject: JSONExport = {
    columns: [],
    rows: [],
    filters: {},
    timestamp: '',
    reportName: '',
    softwareName: '',
    softwareVersion: '',
  };

  const columns = report.columns;
  const displayPrecision =
    (report.fyo.singles.SystemSettings?.display_precision as number) ?? 2;

  /**
   * Set columns as list of fieldname, label
   */
  exportObject.columns = columns.map(({ fieldname, label }) => ({
    fieldname,
    label,
  }));

  /**
   * Set rows as fieldname: value map
   */
  for (const row of report.reportData) {
    if (row.isEmpty) {
      continue;
    }

    const rowObj: Record<string, unknown> = {};
    for (let c = 0; c < row.cells.length; c++) {
      const { label, fieldname } = columns[c];
      const cell = row.cells[c];
      // If the cell's display value is empty (due to hideGroupAmounts or similar),
      // export empty string instead of the rawValue
      let cellValue: unknown;
      if (cell.value === '' && row.isGroup) {
        cellValue = '';
      } else {
        cellValue = getValueFromCell(cell, fieldname, displayPrecision);
      }
      rowObj[label] = cellValue;
    }

    exportObject.rows.push(rowObj);
  }

  /**
   * Set filter map
   */
  for (const { fieldname } of report.filters) {
    const value = report.get(fieldname);
    if (getIsNullOrUndef(value)) {
      continue;
    }

    exportObject.filters[fieldname] = String(toExportValue(fieldname, value));
  }

  /**
   * Metadata
   */
  exportObject.timestamp = new Date().toISOString();
  exportObject.reportName = report.reportName;
  exportObject.softwareName = 'Frappe Books';
  exportObject.softwareVersion = report.fyo.store.appVersion;

  return JSON.stringify(exportObject);
}

export function getCsvData(report: Report): string {
  const csvMatrix = convertReportToCSVMatrix(report);
  return generateCSV(csvMatrix);
}

function convertReportToCSVMatrix(report: Report): unknown[][] {
  const displayPrecision =
    (report.fyo.singles.SystemSettings?.display_precision as number) ?? 2;
  const reportData = report.reportData;
  const columns = report.columns;

  const csvdata: unknown[][] = [];
  csvdata.push(columns.map((c) => c.label));
  for (const row of reportData) {
    if (row.isEmpty) {
      csvdata.push(Array(row.cells.length).fill(''));
      continue;
    }

    const csvrow: unknown[] = [];
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      // If the cell's display value is empty (due to hideGroupAmounts or similar),
      // export empty string instead of the rawValue
      if (cell.value === '' && row.isGroup) {
        csvrow.push('');
      } else {
        csvrow.push(
          getValueFromCell(cell, columns[c].fieldname, displayPrecision)
        );
      }
    }

    csvdata.push(csvrow);
  }

  return csvdata;
}

function getValueFromCell(
  cell: ReportCell,
  fieldname: string,
  displayPrecision: number
) {
  const rawValue = toExportValue(fieldname, cell.rawValue);

  if (rawValue instanceof Date) {
    return rawValue.toISOString();
  }

  if (typeof rawValue === 'number') {
    const value = rawValue.toFixed(displayPrecision);

    /**
     * remove insignificant zeroes
     */
    if (
      displayPrecision > 0 &&
      value.endsWith('0'.repeat(displayPrecision))
    ) {
      return value.slice(0, -displayPrecision - 1);
    }

    return value;
  }

  if (getIsNullOrUndef(cell)) {
    return '';
  }

  return rawValue;
}

function toExportValue<T>(fieldname: string, value: T): T | string {
  if (!REFERENCE_FIELDNAMES.includes(fieldname)) {
    return value;
  }

  return toSchemaName(String(value)) ?? value;
}

export function saveExportData(
  data: string,
  fileName: string,
  message?: string
) {
  downloadFile(data, fileName, 'text/plain;charset=utf-8');
  message ??= t`Export Successful`;
  showToast({ message, type: 'success' });
}
