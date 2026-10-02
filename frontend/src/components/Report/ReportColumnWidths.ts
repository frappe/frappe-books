import type { ColumnField, ReportData } from 'reports/types';
import { ColumnWidths, getFont, measureText } from 'src/utils/columnWidths';

export class ReportColumnWidths extends ColumnWidths {
  private remSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );

  constructor(reportName: string) {
    super(`books:report-column-widths:${reportName}`);
  }

  get(column: ColumnField) {
    const minimum =
      column.fieldname === 'item' || column.fieldtype === 'Datetime'
        ? 15
        : column.fieldtype === 'Date'
          ? 10
          : 0;
    return (
      this.widths[column.fieldname] ??
      Math.max((column.width ?? 1) * 8, minimum) * this.remSize
    );
  }

  /** Fits the label in the header's font and the values in the body's. */
  fit(
    column: ColumnField,
    index: number,
    rows: ReportData,
    header: HTMLElement,
    body: HTMLElement
  ) {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;

    const style = getComputedStyle(header);
    const bodyStyle = getComputedStyle(body);
    const padding =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    context.font = getFont(style);
    let width = measureText(context, column.label, style);

    for (const row of rows) {
      const cell = row.cells[index];
      if (!cell) continue;
      const { fontSize, fontFamily, fontStyle, fontWeight } = bodyStyle;
      const weight = cell.bold ? '700' : row.isGroup ? '600' : fontWeight;
      const slant = cell.italics ? 'italic' : fontStyle;
      context.font = `${slant} ${weight} ${fontSize} ${fontFamily}`;
      const indent = (cell.indent ?? 0) * 2 * this.remSize;
      width = Math.max(
        width,
        measureText(context, cell.value, bodyStyle) + indent
      );
    }

    this.set(column.fieldname, Math.ceil(width + padding + 2), true);
  }
}
