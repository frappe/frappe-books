import { isEqual } from 'lodash';
import type { DocValue } from 'fyo/core/types';
import type { Action } from 'fyo/model/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import type { ServerFilters } from 'reports/serverReport';
import type { ColumnField, ReportCell, ReportRow } from 'reports/types';
import type { Field, FieldType, RawValue } from 'schemas/types';
import { formatCurrencyValue } from 'fyo/utils/format';
import { toFrappeValue } from 'src/frappe/values';
import { getAccessoryCompany } from 'src/frappe/mode';
import { serverHtmlToText } from 'src/utils/serverHtml';
import { getIsNullOrUndef } from 'utils';
import {
  DEFAULT,
  getDefaultContext,
  resolveDefault,
  resolveValue,
} from './defaults';
import { isShown, toFilterField } from './filterFields';
import { runERPNextReport, type ERPNextRow } from './run';
import type {
  ERPNextFilter,
  ERPNextReportDefinition,
  FilterValues,
} from './types';

/** Labels ERPNext quotes mark its opening, total and closing rows, e.g. `'Opening'`. */
const QUOTED = /^'(.*)'$/;

/**
 * An ERPNext report, run through Frappe as Desk runs it, with the filters
 * its Books definition mirrors from ERPNext's report JS.
 */
export abstract class ERPNextReport extends Report {
  static definition: ERPNextReportDefinition;
  // ERPNext's ledgers pick a document by its number; no filter takes its doctype.
  static referenceFilters: [type: string, name: string] = [
    'voucher_type',
    'voucher_no',
  ];
  static dateFilters: [from: string, to: string] = ['from_date', 'to_date'];
  static partyFilters: [type: string, name: string] = ['party_type', 'party'];

  // Account trees fold instead; flat reports page their entries.
  usePagination = !(this.constructor as typeof ERPNextReport).definition.tree;
  private hasDefaults = false;
  private runs = 0;

  get definition(): ERPNextReportDefinition {
    return (this.constructor as typeof ERPNextReport).definition;
  }

  get tabFilters(): string[] {
    return this.definition.tabs ?? [];
  }

  get marksRequired(): boolean {
    return true;
  }

  get foldsFromChevrons(): boolean {
    return !!this.definition.tree;
  }

  /** Every filter's value, unset ones as undefined, as ERPNext's conditions read them. */
  get values(): FilterValues {
    return Object.fromEntries(
      this.definition.filters.map(({ fieldname }) => [
        fieldname,
        this[fieldname],
      ])
    );
  }

  /** The values sent: the shown filters' and the hidden ones' defaults. */
  get filterMap(): Record<string, RawValue> {
    const values = this.values;
    const sent = this.definition.filters.filter(
      (filter) => filter.hidden || isShown(filter, values)
    );
    return Object.fromEntries(
      sent.flatMap(({ fieldname }) =>
        isEmpty(values[fieldname]) ? [] : [[fieldname, values[fieldname]]]
      )
    ) as Record<string, RawValue>;
  }

  getFilters(): Field[] {
    const values = this.values;
    return this.definition.filters
      .filter((filter) => isShown(filter, values))
      .map((filter) => toFilterField(filter, values));
  }

  /** The defaults, once: a filter cleared later stays empty, as in Desk. */
  async setDefaultFilters(): Promise<void> {
    if (this.hasDefaults) {
      return;
    }

    const context = await this.getDefaultFilters();
    const onLoad = this.definition.onLoad ?? {};
    for (const filter of this.definition.filters) {
      const loaded = resolveValue(onLoad[filter.fieldname], context);
      this[filter.fieldname] ??=
        loaded ?? resolveDefault(filter, context) ?? undefined;
    }
    this.hasDefaults = true;
  }

  /** The values the default tokens stand for, fetched once per report. */
  async getDefaultFilters(): Promise<ServerFilters> {
    this.serverDefaults ??= (await getDefaultContext()) as ServerFilters;
    return this.serverDefaults;
  }

  getFiscalYear(): { start?: Date; end?: Date } {
    const start = this.serverDefaults?.[DEFAULT.fiscalYearStart];
    const end = this.serverDefaults?.[DEFAULT.fiscalYearEnd];
    return start && end
      ? { start: new Date(String(start)), end: new Date(String(end)) }
      : {};
  }

  /** Cleared dates take their defaults back, as they cannot be left empty. */
  getDocumentFilterResets(): Record<string, DocValue> {
    const context = this.serverDefaults ?? {};
    const resets: Record<string, DocValue> = { voucher_no: null };
    if (!this.get('voucher_no')) {
      return resets;
    }

    for (const filter of this.definition.filters) {
      if (this.dateFilters.includes(filter.fieldname)) {
        resets[filter.fieldname] = resolveDefault(filter, context) as DocValue;
      }
    }
    return resets;
  }

  async set(key: string, value: DocValue, callPostSet = true) {
    const filter = this.getFilter(key);
    const field = this.filters.find(({ fieldname }) => fieldname === key);
    if (!filter || !field) {
      return;
    }

    const next = this.toValue(filter, field, value);
    if (isEqual(this[key], next)) {
      return;
    }

    this.setValue(key, next);
    this.clearDependents(key);
    await this.applyChange(key);
    if (callPostSet) {
      await this.updateData(key);
    }
  }

  async setReportData(): Promise<void> {
    const run = ++this.runs;
    this.error = '';
    this.missingFilter =
      this.filters.find(
        ({ fieldname, required }) => required && isEmpty(this[fieldname])
      ) ?? null;
    if (this.missingFilter) {
      this.clearResult();
      return;
    }

    this.loading = true;
    try {
      const result = await runERPNextReport(
        this.definition.reportName,
        this.filterMap,
        this.definition.filters
      );
      if (run !== this.runs) {
        return;
      }

      this.columns = result.columns;
      this.message = result.message;
      this.chart = result.chart;
      this.summary = result.summary;
      this.reportData = result.rows.map((row) =>
        Object.keys(row).length ? this.getRow(row) : this.getEmptyRow()
      );
    } catch (error) {
      if (run === this.runs) {
        this.clearResult();
        this.error = serverHtmlToText(
          error instanceof Error ? error.message : String(error)
        );
      }
    } finally {
      if (run === this.runs) {
        this.loading = false;
      }
    }
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  /** Account trees indent and fold; quoted rows are ERPNext's totals; Frappe's total row too. */
  getRow(row: ERPNextRow): ReportRow {
    const isTotal = !!row.__total || Object.values(row).some(isQuoted);
    const level = Number(row.indent ?? 0);
    const cells = this.columns.map((column) => this.getRowCell(column, row));
    const isTree = !!this.definition.tree;
    if (isTree && cells.length) {
      cells[0].indent = level;
    }

    for (const cell of cells) {
      cell.bold = isTotal && !isTree;
    }

    return {
      cells,
      level,
      isGroup: isTree && !!(row.is_group || row.is_group_account),
      isTotal,
      isSummary: isTotal,
      isShaded: isTree && isTotal,
      folded: false,
      foldedBelow: false,
    };
  }

  getRowCell(column: ColumnField, row: ERPNextRow): ReportCell {
    const rawValue = this.getRawValue(column, row);
    return {
      rawValue,
      value: this.formatRowValue(column, rawValue, row),
      align: column.align,
      width: column.width,
    };
  }

  /** An account tree names accounts by their account name, as Desk's formatter does. */
  getRawValue(column: ColumnField, row: ERPNextRow): RawValue | undefined {
    const isLabel = this.definition.tree && column === this.columns[0];
    const value = isLabel
      ? (row.account_name ?? row[column.fieldname])
      : row[column.fieldname];
    if (typeof value !== 'string') {
      return value;
    }

    const unquoted = value.replace(QUOTED, '$1');
    // Frappe sends datetimes with a space, which ISO parsing needs as a T.
    return column.fieldtype === 'Datetime'
      ? unquoted.replace(' ', 'T')
      : unquoted;
  }

  formatRowValue(
    column: ColumnField,
    rawValue: RawValue | undefined,
    row: ERPNextRow
  ): string {
    if (getIsNullOrUndef(rawValue) || rawValue === '') {
      return '';
    }

    const fieldtype = column.fieldtype as FieldType | 'Percent';
    if (fieldtype === 'Currency') {
      return formatCurrencyValue(
        rawValue,
        this.getCurrency(column, row),
        this.fyo
      );
    }

    if (fieldtype === 'Percent') {
      return this.fyo.format(rawValue, {
        fieldname: column.fieldname,
        label: column.label,
        fieldtype: 'Float',
        control: 'Percent',
      });
    }

    return this.formatValue(column, rawValue);
  }

  /** A Currency column's currency: the row field its options name, else the row's or the company's. */
  getCurrency(column: ColumnField, row: ERPNextRow): string {
    const named = column.options ? row[column.options] : undefined;
    const currency = typeof named === 'string' && named ? named : row.currency;
    if (typeof currency === 'string' && currency) {
      return currency;
    }

    return (
      getCompanyCurrency() ||
      String(this.fyo.singles.SystemSettings?.currency ?? '')
    );
  }

  private getFilter(fieldname: string): ERPNextFilter | undefined {
    return this.definition.filters.find((f) => f.fieldname === fieldname);
  }

  /** A MultiSelectList holds a list of names; one name, as a party link sets, is a list of one. */
  private toValue(filter: ERPNextFilter, field: Field, value: DocValue) {
    if (filter.fieldtype === 'MultiSelectList') {
      const list = [value].flat().filter(Boolean) as string[];
      return list.length ? list : null;
    }

    return isEmpty(value) ? null : toFrappeValue(value, field, this.fyo);
  }

  private setValue(key: string, value: unknown) {
    if (getIsNullOrUndef(value)) {
      delete this[key];
    } else {
      this[key] = value;
    }
  }

  /** A filter naming the doctype of another, like Party Type, clears it. */
  private clearDependents(key: string) {
    for (const filter of this.definition.filters) {
      if (filter.options === key) {
        delete this[filter.fieldname];
      }
    }
  }

  private async applyChange(key: string) {
    const change = await this.definition.onChange?.[key]?.(this.values);
    for (const [fieldname, value] of Object.entries(change ?? {})) {
      this.setValue(fieldname, value);
    }
  }

  private clearResult() {
    this.reportData = [];
    this.message = '';
    this.chart = null;
    this.summary = [];
  }
}

function isEmpty(value: unknown): boolean {
  return (
    getIsNullOrUndef(value) ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  );
}

function isQuoted(value: unknown): boolean {
  return typeof value === 'string' && QUOTED.test(value);
}

interface CompanyDoc {
  doctype: string;
  name: string;
  default_currency?: string;
}

/** The accessory company's currency, from ERPNext's boot. */
function getCompanyCurrency(): string {
  const docs = (globalThis.window?.frappe?.boot?.docs ?? []) as CompanyDoc[];
  const company = docs.find(
    (doc) => doc.doctype === ':Company' && doc.name === getAccessoryCompany()
  );
  return company?.default_currency ?? '';
}

/** A report class for an ERPNext report definition. */
export function makeERPNextReport(definition: ERPNextReportDefinition) {
  return class extends ERPNextReport {
    static definition = definition;
    static title = definition.title;
    static reportName = definition.reportName;
    static serverReportName = definition.reportName;
    static isInventory = !!definition.isInventory;
    static phoneLayout = definition.phoneLayout;
  };
}
