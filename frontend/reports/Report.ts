import { Fyo } from 'fyo';
import { toFrappeValue } from 'src/frappe/values';
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
  ReportChart,
  ReportData,
  ReportRow,
  SummaryItem,
} from './types';

export abstract class Report extends Observable<RawValue> {
  static title: string;
  static reportName: string;
  /** The Script Report that computes this report on the server. */
  static serverReportName: string;
  static isInventory = false;
  static phoneLayout?: PhoneLayout;
  /** The filters that pick one document's entries: its doctype and name. */
  static referenceFilters: [type: string, name: string] = [
    'voucherType',
    'voucherNo',
  ];
  /** The filters of a date range: From and To. */
  static dateFilters: [from: string, to: string] = ['fromDate', 'toDate'];
  /** The filters that pick one party's entries: its doctype and name. */
  static partyFilters: [type: string, name: string] = ['partyType', 'party'];

  fyo: Fyo;
  columns: ColumnField[] = [];
  filters: Field[] = [];
  reportData: ReportData;
  usePagination = false;
  loading = false;
  serverDefaults?: ServerFilters;
  /** What a report may return besides its rows. */
  message = '';
  chart: ReportChart | null = null;
  summary: SummaryItem[] = [];
  /** Why the report could not run, as the server says it. */
  error = '';
  /** A required filter left empty, which keeps the report from running. */
  missingFilter: Field | null = null;

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

  get referenceFilters(): [type: string, name: string] {
    return (this.constructor as typeof Report).referenceFilters;
  }

  /** Select filters shown as tabs, while their options fit. */
  get tabFilters(): string[] {
    return ['periodicity'];
  }

  /** Whether filter pills mark required filters with `*`. */
  get marksRequired(): boolean {
    return false;
  }

  /** Whether group rows show a chevron that folds them. */
  get foldsFromChevrons(): boolean {
    return false;
  }

  get dateFilters(): [from: string, to: string] {
    return (this.constructor as typeof Report).dateFilters;
  }

  /** The filter values that show one document's entries, which all post on its date. */
  static getVoucherFilters(
    doctype: string,
    name: string,
    date: DocValue
  ): Record<string, DocValue> {
    const [typeFilter, nameFilter] = this.referenceFilters;
    const [fromFilter, toFilter] = this.dateFilters;
    return {
      [typeFilter]: doctype,
      [nameFilter]: name,
      [fromFilter]: date,
      [toFilter]: date,
    };
  }

  /**
   * Ref filters pick one document, so they last only while a link sets them,
   * as do the dates its ledger link sets with them; cleared dates take defaults.
   */
  getDocumentFilterResets(): Record<string, DocValue> {
    const [typeFilter, nameFilter] = this.referenceFilters;
    const resets = { [typeFilter]: 'All', [nameFilter]: null };
    const [fromFilter, toFilter] = this.dateFilters;
    return this.get(nameFilter)
      ? { ...resets, [fromFilter]: null, [toFilter]: null }
      : resets;
  }

  /** The fiscal year the date presets offer, from Accounting Settings. */
  getFiscalYear(): { start?: Date; end?: Date } {
    const settings = this.fyo.singles.AccountingSettings;
    return {
      start: settings?.year_start_date as Date | undefined,
      end: settings?.year_end_date as Date | undefined,
    };
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
      : toFrappeValue(value, field, this.fyo);
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

    if (column.fieldname === 'voucher_type') {
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
