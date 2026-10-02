import { t } from 'fyo';
import { sortBy } from 'lodash';
import type { Report } from 'reports/Report';
import type {
  ColumnField,
  PhoneTreeLayout,
  ReportCell,
  ReportRow,
} from 'reports/types';
import type { FieldType } from 'schemas/types';
import { getColumnIndex } from './mobileRows';

export const TOTAL_COLUMN = 'total';
const DEFAULT_WIDTH = 128;

export interface MobileValueColumn {
  key: string;
  label: string;
  width: number;
  fieldtype: FieldType;
  /** The cell of a row shown in this column. */
  getCell: (row: ReportRow) => ReportCell | undefined;
}

export interface MobileValue {
  text: string;
  isZero: boolean;
}

export interface MobileTreeRow {
  key: string;
  label: string;
  subtitle?: string;
  values: MobileValue[];
  depth: number;
  isGroup: boolean;
  isTotal: boolean;
  isChild: boolean;
  source?: ReportRow;
}

/** A report as a tree of rows with one label and at most two values. */
export class MobileTree {
  constructor(
    public report: Report,
    public layout: PhoneTreeLayout
  ) {}

  get labelIndex() {
    return getColumnIndex(this.report, this.layout.label);
  }

  /** The column that names the top-level rows. */
  get headerIndex() {
    return getColumnIndex(
      this.report,
      this.layout.groupBy ?? this.layout.label
    );
  }

  /** Columns to pick from in the Column sheet; empty for fixed values. */
  get columnOptions(): MobileValueColumn[] {
    if (!this.layout.periods) {
      return [];
    }

    const options = this.report.columns.flatMap((column, index) =>
      index === this.labelIndex ? [] : [this.getValueColumn(column, index)]
    );
    return sortBy(options, ({ key }) => key !== TOTAL_COLUMN);
  }

  getValueColumns(choice?: string): MobileValueColumn[] {
    const options = this.columnOptions;
    if (options.length) {
      return [options.find(({ key }) => key === choice) ?? options[0]];
    }

    return (this.layout.values ?? []).flatMap((value) => {
      const index = getColumnIndex(this.report, value.fieldname);
      const column = this.report.columns[index];
      return column ? [this.getValueColumn(column, index, value)] : [];
    });
  }

  getRows(values: MobileValueColumn[]): MobileTreeRow[] {
    return this.layout.groupBy
      ? this.getGroupedRows(values, this.layout.groupBy)
      : this.getReportRows(values);
  }

  getReportRows(values: MobileValueColumn[]): MobileTreeRow[] {
    return this.report.reportData.flatMap((row, index) => {
      if (row.isEmpty) {
        return [];
      }

      const label = row.cells[this.labelIndex];
      return {
        // Group keys outlive reloads, so collapsed groups stay collapsed.
        key: row.isGroup ? `group:${String(label?.rawValue)}` : String(index),
        label: label?.value ?? '',
        values: values.map((value) => this.getValue([row], value)),
        depth: row.level ?? 0,
        isGroup: !!row.isGroup,
        isTotal: !!row.isTotal,
        isChild: false,
        source: row,
      };
    });
  }

  /** Rows under a group row per value of `groupBy`, then a total row. */
  getGroupedRows(values: MobileValueColumn[], groupBy: string) {
    const groupIndex = getColumnIndex(this.report, groupBy);
    const groups = new Map<string, ReportRow[]>();
    for (const row of this.report.reportData) {
      if (row.isEmpty) continue;
      const name = row.cells[groupIndex]?.value ?? '';
      const group = groups.get(name) ?? [];
      group.push(row);
      groups.set(name, group);
    }

    const rows: MobileTreeRow[] = [];
    for (const [name, children] of groups) {
      rows.push(this.getGroupRow(name, children, values));
      rows.push(
        ...children.map((row, index) => ({
          ...this.getSummaryRow(`${name}:${index}`, [row], values),
          label: row.cells[this.labelIndex]?.value ?? '',
          depth: 1,
          isChild: true,
          source: row,
        }))
      );
    }

    const all = [...groups.values()].flat();
    if (all.length) {
      rows.push({
        ...this.getSummaryRow(TOTAL_COLUMN, all, values),
        label: t`Total`,
        isTotal: true,
      });
    }

    return rows;
  }

  getGroupRow(name: string, rows: ReportRow[], values: MobileValueColumn[]) {
    // Rows can repeat a label, such as one location's batches.
    const labels = new Set(
      rows.map((row) => row.cells[this.labelIndex]?.value)
    );
    return {
      ...this.getSummaryRow(`group:${name}`, rows, values),
      label: name,
      subtitle: this.layout.describeGroup?.(labels.size),
      isGroup: true,
    };
  }

  getSummaryRow(
    key: string,
    rows: ReportRow[],
    values: MobileValueColumn[]
  ): MobileTreeRow {
    return {
      key,
      label: '',
      values: values.map((value) => this.getValue(rows, value)),
      depth: 0,
      isGroup: false,
      isTotal: false,
      isChild: false,
    };
  }

  /** A row's own cell, or the sum of a group's cells. */
  getValue(rows: ReportRow[], column: MobileValueColumn): MobileValue {
    const cells = rows.map((row) => column.getCell(row));
    const sum = cells.reduce(
      (total, cell) => total + Number(cell?.rawValue ?? 0),
      0
    );
    const precision = this.report.fyo.singles.SystemSettings?.display_precision;
    const isZero = Number(sum.toFixed(precision ?? 2)) === 0;
    if (cells.length === 1) {
      return { text: cells[0]?.value ?? '', isZero };
    }

    if (cells.every((cell) => !cell?.value)) {
      return { text: '', isZero };
    }

    return { text: this.report.fyo.format(sum, column.fieldtype), isZero };
  }

  getValueColumn(
    column: ColumnField,
    index: number,
    value?: { label?: string; width?: number }
  ): MobileValueColumn {
    return {
      key: column.fieldname,
      label: value?.label ?? column.label,
      width: value?.width ?? DEFAULT_WIDTH,
      fieldtype: column.fieldtype,
      getCell: (row) => row.cells[index],
    };
  }
}

/** Rows below a collapsed group are left out. */
export function getVisibleRows(
  rows: MobileTreeRow[],
  isCollapsed: (row: MobileTreeRow) => boolean
) {
  const visible: MobileTreeRow[] = [];
  let hiddenBelow: number | null = null;
  for (const row of rows) {
    if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
    hiddenBelow = row.isGroup && isCollapsed(row) ? row.depth : null;
    visible.push(row);
  }

  return visible;
}
