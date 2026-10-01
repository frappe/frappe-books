import type { ReportCell } from 'reports/types';

/** Grey out empty cells and amounts that round to zero at the display precision. */
export function getReportCellColorClass(
  cell: ReportCell,
  displayPrecision: number
): string {
  if (cell.color === 'red') {
    return 'text-ink-red-5';
  }
  if (cell.color === 'green') {
    return 'text-ink-green-5';
  }
  if (!cell.rawValue) {
    return 'text-ink-gray-6';
  }
  if (typeof cell.rawValue !== 'number') {
    return 'text-ink-gray-9';
  }
  if (Number(cell.rawValue.toFixed(displayPrecision)) === 0) {
    return 'text-ink-gray-6';
  }
  return 'text-ink-gray-9';
}
