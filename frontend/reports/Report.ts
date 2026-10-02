import { Fyo } from 'fyo';
import { Converter } from 'fyo/utils/converter';
import { DocValue } from 'fyo/core/types';
import { Action } from 'fyo/model/types';
import Observable from 'fyo/utils/observable';
import { Field, RawValue } from 'schemas/types';
import { getLinkLabel } from 'src/frappe/link';
import { getDoctypeLabel } from 'src/frappe/registry';
import { getIsNullOrUndef } from 'utils';
import {
  getServerDefaultFilters,
  isBlankRow,
  runServerReport,
  ServerFilters,
  ServerReportResult,
  ServerRow,
} from './serverReport';
import {
  ColumnField,
  PhoneLayout,
  ReportCell,
  ReportData,
  ReportRow,
} from './types';

export abstract class Report extends Observable<RawValue> {
  static title: string;
  static reportName: string;
  /** The Script Report that computes this report on the server. */
  static serverReportName: string;
  static isInventory = false;
  static phoneLayout?: PhoneLayout;

  fyo: Fyo;
  columns: ColumnField[] = [];
  filters: Field[] = [];
  reportData: ReportData;
  usePagination = false;
  loading = false;
  serverDefaults?: ServerFilters;

  constructor(fyo: Fyo) {
    super();
    this.fyo = fyo;
    this.reportData = [];
  }

  get title(): string {
    return (this.constructor as typeof Report).title;
  }

  get reportName(): string {
    return (this.constructor as typeof Report).reportName;
  }

  get serverReportName(): string {
    return (this.constructor as typeof Report).serverReportName;
  }

  get phoneLayout(): PhoneLayout | undefined {
    return (this.constructor as typeof Report).phoneLayout;
  }

  /** Loads the report once with the given filter values set. */
  async initialize(filters: Record<string, DocValue> = {}) {
    await this.refreshFilters();
    await this.setFilters(filters);
    this.columns = await this.getColumns();
    await this.setReportData();
  }

  get filterMap() {
    const filterMap: Record<string, RawValue> = {};
    for (const { fieldname } of this.filters) {
      const value = this.get(fieldname);
      if (getIsNullOrUndef(value)) {
        continue;
      }

      filterMap[fieldname] = value;
    }

    return filterMap;
  }

  async set(key: string, value: DocValue, callPostSet = true) {
    const field = this.filters.find((f) => f.fieldname === key);
    if (field === undefined) {
      return;
    }

    // Clearing works for every field type, including checks.
    value = getIsNullOrUndef(value)
      ? null
      : Converter.toRawValue(value, field, this.fyo);
    const prevValue = this[key];
    if (prevValue === value) {
      return;
    }

    if (getIsNullOrUndef(value)) {
      delete this[key];
    } else {
      this[key] = value;
    }

    this.clearDynamicLinks(key);
    if (callPostSet) {
      await this.updateData(key);
    }
  }

  /** A dynamic link names a document of the type it references, so a new type clears it. */
  clearDynamicLinks(references: string) {
    for (const field of this.filters) {
      if (
        field.fieldtype === 'DynamicLink' &&
        field.references === references
      ) {
        delete this[field.fieldname];
      }
    }
  }

  /** Sets filter values in order, without loading data. */
  async setFilters(values: Record<string, DocValue>) {
    for (const [key, value] of Object.entries(values)) {
      await this.set(key, value, false);
      // A value can add the filter fields that follow it.
      await this.refreshFilters();
    }
  }

  async refreshFilters() {
    await this.setDefaultFilters();
    this.filters = await this.getFilters();
  }

  async updateData(key?: string, force?: boolean) {
    await this.refreshFilters();
    this.columns = await this.getColumns();
    await this.setReportData(key, force);
  }

  /** Server columns replace these once the report data loads. */
  getColumns(): ColumnField[] | Promise<ColumnField[]> {
    return this.columns;
  }

  async setReportData(_filter?: string, _force?: boolean): Promise<void> {
    this.loading = true;
    const { columns, rows } = await this.runReport();
    this.columns = columns;
    this.reportData = rows.map((row) =>
      isBlankRow(row) ? this.getEmptyRow() : this.getReportRow(row)
    );
    this.loading = false;
  }

  runReport(): Promise<ServerReportResult> {
    return runServerReport(this.serverReportName, this.filterMap);
  }

  /** Filter values computed on the server, fetched once per report. */
  async getDefaultFilters(): Promise<ServerFilters> {
    this.serverDefaults ??= await getServerDefaultFilters(
      this.serverReportName
    );
    return this.serverDefaults;
  }

  getReportRow(row: ServerRow): ReportRow {
    return {
      cells: this.columns.map((column) =>
        this.getCell(column, row[column.fieldname])
      ),
    };
  }

  getCell(column: ColumnField, rawValue: RawValue | undefined): ReportCell {
    return {
      rawValue,
      value: this.formatValue(column, rawValue),
      align: column.align,
      width: column.width,
    };
  }

  formatValue(column: ColumnField, rawValue: RawValue | undefined): string {
    if (rawValue === null || rawValue === undefined) {
      return '';
    }

    if (column.fieldname === 'reference_type') {
      return getDoctypeLabel(String(rawValue));
    }

    if (column.target) {
      return getLinkLabel(column.target, String(rawValue));
    }

    return this.fyo.format(rawValue, column.fieldtype);
  }

  getEmptyRow(): ReportRow {
    return {
      isEmpty: true,
      cells: this.columns.map((column) => ({
        value: '',
        rawValue: '',
        width: column.width,
        align: 'left',
      })),
    };
  }

  /**
   * Should first check if filter value is set
   * and update only if it is not set.
   */
  abstract setDefaultFilters(): void | Promise<void>;
  abstract getActions(): Action[];
  abstract getFilters(): Field[] | Promise<Field[]>;
}
