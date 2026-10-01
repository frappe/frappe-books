import type { ReportCell } from 'reports/types';

/** Grey out empty cells and amounts that round to zero at the display precision. */
export function getReportCellColorClass(
  cell: ReportCell,
  displayPrecision: number,
  isGroup = false
): string {
  if (cell.color === 'red') {
    return 'text-ink-red-5';
  }
  if (cell.color === 'green') {
    return 'text-ink-green-5';
  }
  if (!cell.rawValue) {
    return 'text-ink-gray-5';
  }
  if (typeof cell.rawValue !== 'number') {
    return isGroup ? 'text-ink-gray-7' : 'text-ink-gray-8';
  }
  if (Number(cell.rawValue.toFixed(displayPrecision)) === 0) {
    return 'text-ink-gray-5';
  }
  return 'text-ink-gray-7';
}
