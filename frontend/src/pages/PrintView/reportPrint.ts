import type { Report } from 'reports/Report';
import type { ReportCell, ReportRow } from 'reports/types';
import type { Field } from 'schemas/types';

/** The filters a printed report's figures are for, such as its period. */
export function getPrintedFilters(report: Report): string {
  return report.filters
    .filter(({ fieldname }) => isFiltering(report.get(fieldname)))
    .map((field) => formatFilter(report, field))
    .join(' · ');
}

/** The inline font and indent the report shows a cell with. */
export function getCellTypeStyle(cell: ReportCell, row: ReportRow) {
  return {
    fontWeight: cell.bold || row.isGroup ? 'bold' : undefined,
    fontStyle: cell.italics ? 'italic' : undefined,
    paddingInlineStart: cell.indent ? `${0.5 + cell.indent}rem` : undefined,
  };
}

/** Empty, off, All and none filter nothing. */
function isFiltering(value: unknown): boolean {
  return ![undefined, null, '', false, 'All', 'none'].includes(value as never);
}

function formatFilter(report: Report, field: Field): string {
  if (field.fieldtype === 'Check') {
    return field.label;
  }

  const value = report.fyo.format(report.get(field.fieldname), field);
  return `${field.label}: ${value}`;
}
