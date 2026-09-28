import type { ColumnField, ReportData } from 'reports/types';

export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 4096;

export class ReportColumnWidths {
  widths: Record<string, number> = {};
  private storageKey: string;
  private remSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );

  constructor(reportName: string) {
    this.storageKey = `books:report-column-widths:${reportName}`;
    this.load();
  }

  getKey(column: ColumnField) {
    return column.fieldname;
  }

  get(column: ColumnField) {
    const minimum =
      column.fieldname === 'item' || column.fieldtype === 'Datetime'
        ? 15
        : column.fieldtype === 'Date'
          ? 10
          : 0;
    return (
      this.widths[this.getKey(column)] ??
      Math.max((column.width ?? 1) * 8, minimum) * this.remSize
    );
  }

  set(column: ColumnField, width: number, persist = false) {
    this.widths[this.getKey(column)] = Math.round(
      Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))
    );
    if (persist) this.save();
  }

  fit(
    column: ColumnField,
    index: number,
    rows: ReportData,
    header: HTMLElement
  ) {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;

    const style = getComputedStyle(header);
    const padding =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    context.font = style.font;
    let width = this.measure(context, column.label, style);

    for (const row of rows) {
      const cell = row.cells[index];
      if (!cell) continue;
      const weight = cell.bold ? '700' : row.isGroup ? '500' : style.fontWeight;
      const slant = cell.italics ? 'italic' : style.fontStyle;
      context.font = `${slant} ${weight} ${style.fontSize} ${style.fontFamily}`;
      const indent = (cell.indent ?? 0) * 2 * this.remSize;
      width = Math.max(
        width,
        this.measure(context, cell.value, style) + indent
      );
    }

    this.set(column, Math.ceil(width + padding + 2), true);
  }

  private measure(
    context: CanvasRenderingContext2D,
    value: string,
    style: CSSStyleDeclaration
  ) {
    const text = value.replace(/\s+/g, ' ');
    const spacing = parseFloat(style.letterSpacing) || 0;
    return context.measureText(text).width + text.length * spacing;
  }

  private load() {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '{}'
      );
      if (!stored || typeof stored !== 'object' || Array.isArray(stored))
        return;
      this.widths = Object.fromEntries(
        Object.entries(stored).filter(
          ([, width]) =>
            typeof width === 'number' &&
            Number.isFinite(width) &&
            width >= MIN_COLUMN_WIDTH &&
            width <= MAX_COLUMN_WIDTH
        )
      );
    } catch {
      // The report still works when browser storage is unavailable.
    }
  }

  private save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.widths));
    } catch {
      // Keep resized widths for this visit if browser storage is unavailable.
    }
  }
}
