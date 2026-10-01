import type { Report } from 'reports/Report';
import type { PhoneLayout, ReportRow } from 'reports/types';
import { toSchemaName } from 'src/frappe/registry';
import { isNumeric } from 'src/utils';

export interface RowDetail {
  key: string;
  label: string;
  value: string;
}

/** The report's phone layout, or its first column and first number. */
export function getPhoneLayout(report: Report): PhoneLayout {
  if (report.phoneLayout) {
    return report.phoneLayout;
  }

  const columns = report.columns.filter(({ label }) => label !== '#');
  const value = columns.find(({ fieldtype }) => isNumeric(fieldtype));
  return {
    type: 'tree',
    label: columns[0]?.fieldname ?? '',
    values: value ? [{ fieldname: value.fieldname }] : [],
  };
}

export function getColumnIndex(report: Report, fieldname: string) {
  return report.columns.findIndex((column) => column.fieldname === fieldname);
}

/** Every column of a row, leaving out the row number. */
export function getRowDetails(report: Report, row: ReportRow): RowDetail[] {
  return report.columns.flatMap((column, index) => {
    if (column.label === '#') {
      return [];
    }

    return {
      key: column.fieldname,
      label: column.label,
      value: row.cells[index]?.value || '—',
    };
  });
}

/** The document a ledger row comes from, when the user can read it. */
export function getRowReference(report: Report, row: ReportRow) {
  const getRaw = (fieldname: string) =>
    row.cells[getColumnIndex(report, fieldname)]?.rawValue;
  const doctype = getRaw('reference_type');
  const name = getRaw('reference_name');
  if (typeof doctype !== 'string' || typeof name !== 'string' || !name) {
    return null;
  }

  const schemaName = toSchemaName(doctype);
  if (!schemaName || !report.fyo.can(schemaName, 'read')) {
    return null;
  }

  return { schemaName, name };
}
