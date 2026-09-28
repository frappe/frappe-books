import { Fyo } from 'fyo';
import Observable from 'fyo/utils/observable';
import { Field, RawValue, SchemaMap } from 'schemas/types';
import { getMapFromList } from 'utils';
import {
  Cashflow,
  DatabaseBase,
  DatabaseDemuxBase,
  GetAllOptions,
  IncomeExpense,
  LinkedDoc,
  QueryFilter,
  ReportQuery,
  SingleValue,
  TopExpenses,
  TotalCreditAndDebit,
  TotalOutstanding,
} from 'utils/db/types';
import { Converter } from './converter';
import {
  DatabaseDemuxConstructor,
  DocValue,
  DocValueMap,
  RawValueMap,
} from './types';
import { StockQuantity } from 'models/inventory/types';
import { Money } from 'pesa';

type FieldMap = Record<string, Record<string, Field>>;

export class DatabaseHandler extends DatabaseBase {
  #fyo: Fyo;
  converter: Converter;
  #demux: DatabaseDemuxBase;
  #schemaMap: SchemaMap = {};
  #fieldMap: FieldMap = {};
  observer: Observable<never> = new Observable();

  constructor(fyo: Fyo, Demux: DatabaseDemuxConstructor) {
    super();
    this.#fyo = fyo;
    this.converter = new Converter(this, this.#fyo);

    this.#demux = new Demux();
  }

  get schemaMap(): Readonly<SchemaMap> {
    return this.#schemaMap;
  }

  get fieldMap(): Readonly<FieldMap> {
    return this.#fieldMap;
  }

  async connect(countryCode?: string) {
    countryCode = await this.#demux.connect(countryCode);
    await this.init();
    return countryCode;
  }

  async init() {
    await this.refreshSchemaMap();
    this.observer = new Observable();
  }

  async refreshSchemaMap() {
    this.#schemaMap = await this.#demux.getSchemaMap();
    this.#setFieldMap();
  }

  async insert(
    schemaName: string,
    docValueMap: DocValueMap
  ): Promise<DocValueMap> {
    let rawValueMap = this.converter.toRawValueMap(
      schemaName,
      docValueMap
    ) as RawValueMap;
    rawValueMap = (await this.#demux.call(
      'insert',
      schemaName,
      rawValueMap
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  // Read
  async get(
    schemaName: string,
    name: string,
    fields?: string | string[]
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.call(
      'get',
      schemaName,
      name,
      fields
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  async getAll(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<DocValueMap[]> {
    const rawValueMap = await this.#getAll(schemaName, options);
    return this.converter.toDocValueMap(
      schemaName,
      rawValueMap
    ) as DocValueMap[];
  }

  async getAllRaw(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<RawValueMap[]> {
    return await this.#getAll(schemaName, options);
  }

  async getSingleValues(
    ...fieldnames: { fieldname: string; parent: string }[]
  ): Promise<SingleValue<DocValue>> {
    const rawSingleValue = (await this.#demux.call(
      'getSingleValues',
      fieldnames
    )) as SingleValue<RawValue>;

    const docSingleValue: SingleValue<DocValue> = [];
    for (const sv of rawSingleValue) {
      const field = this.fieldMap[sv.parent][sv.fieldname];
      const value = Converter.toDocValue(sv.value, field, this.#fyo);

      docSingleValue.push({
        value,
        parent: sv.parent,
        fieldname: sv.fieldname,
      });
    }

    return docSingleValue;
  }

  async count(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<number> {
    return (await this.#demux.call(
      'count',
      schemaName,
      options.filters ?? {}
    )) as number;
  }

  async search(
    text: string,
    fieldsBySchema: Record<string, string[]>,
    limit: number
  ): Promise<Record<string, RawValueMap[]>> {
    return (await this.#demux.call(
      'search',
      text,
      fieldsBySchema,
      limit
    )) as Record<string, RawValueMap[]>;
  }

  // Update
  async rename(
    schemaName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    await this.#demux.call('rename', schemaName, oldName, newName);

    this.observer.trigger(`rename:${schemaName}`, { oldName, newName });
  }

  async update(
    schemaName: string,
    docValueMap: DocValueMap,
    expectedModified?: Date
  ): Promise<DocValueMap> {
    const rawValueMap = this.converter.toRawValueMap(
      schemaName,
      docValueMap
    ) as RawValueMap;
    if (expectedModified instanceof Date) {
      rawValueMap.__expectedModified = expectedModified.toISOString();
    }
    const updatedRawValueMap = (await this.#demux.call(
      'update',
      schemaName,
      rawValueMap
    )) as RawValueMap;
    return this.converter.toDocValueMap(
      schemaName,
      updatedRawValueMap
    ) as DocValueMap;
  }

  async runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string,
    linkedDocs?: LinkedDoc[]
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.runLifecycleAction(
      action,
      schemaName,
      name,
      linkedDocs
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  // Delete
  async delete(schemaName: string, name: string): Promise<void> {
    await this.#demux.call('delete', schemaName, name);

    this.observer.trigger(`delete:${schemaName}`, name);
  }

  async deleteAll(schemaName: string, filters: QueryFilter): Promise<number> {
    return (await this.#demux.call('deleteAll', schemaName, filters)) as number;
  }

  // Other
  async exists(schemaName: string, name?: string): Promise<boolean> {
    return (await this.#demux.call('exists', schemaName, name)) as boolean;
  }

  /** Values a save would calculate for a new or edited document, without saving it. */
  async preview(
    schemaName: string,
    docValueMap: DocValueMap,
    name?: string
  ): Promise<DocValueMap> {
    const rawValueMap = this.converter.toRawValueMap(schemaName, docValueMap);
    const previewed = (await this.#demux.call(
      'preview',
      schemaName,
      rawValueMap,
      name
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, previewed) as DocValueMap;
  }

  /** An unsaved `schemaName` document built by a whitelisted server mapper. */
  async getMapped(
    schemaName: string,
    method: string,
    sourceName: string
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.call(
      'getMapped',
      method,
      sourceName
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  /** An unsaved copy of a document, without the values Frappe marks no_copy. */
  async getDuplicate(schemaName: string, name: string): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.getDuplicate(
      schemaName,
      name
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  // The Frappe adapter runs these complex queries on the server.

  async getTopExpenses(fromDate: string, toDate: string): Promise<TopExpenses> {
    return (await this.#demux.callBespoke(
      'getTopExpenses',
      fromDate,
      toDate
    )) as TopExpenses;
  }

  async getTotalOutstanding(
    schemaName: string,
    fromDate: string,
    toDate: string
  ): Promise<TotalOutstanding> {
    return (await this.#demux.callBespoke(
      'getTotalOutstanding',
      schemaName,
      fromDate,
      toDate
    )) as TotalOutstanding;
  }

  async getCashflow(fromDate: string, toDate: string): Promise<Cashflow> {
    return (await this.#demux.callBespoke(
      'getCashflow',
      fromDate,
      toDate
    )) as Cashflow;
  }

  async getIncomeAndExpenses(
    fromDate: string,
    toDate: string
  ): Promise<IncomeExpense> {
    return (await this.#demux.callBespoke(
      'getIncomeAndExpenses',
      fromDate,
      toDate
    )) as IncomeExpense;
  }

  async getTotalCreditAndDebit(): Promise<TotalCreditAndDebit[]> {
    return (await this.#demux.callBespoke(
      'getTotalCreditAndDebit'
    )) as TotalCreditAndDebit[];
  }

  async getStockQuantity(
    item: string,
    location?: string,
    fromDate?: string,
    toDate?: string,
    batch?: string,
    serialNumbers?: string[]
  ): Promise<number | null> {
    return (await this.#demux.callBespoke(
      'getStockQuantity',
      item,
      location,
      fromDate,
      toDate,
      batch,
      serialNumbers
    )) as number | null;
  }

  async getStockQuantities(
    location?: string,
    items?: string[]
  ): Promise<StockQuantity[]> {
    return (await this.#demux.callBespoke(
      'getStockQuantities',
      location,
      items
    )) as StockQuantity[];
  }

  /** The location the server moves an invoice's stock from or to. */
  async getStockLocation(
    schemaName: string,
    isPOS: boolean
  ): Promise<string | null> {
    return (await this.#demux.callBespoke(
      'getStockLocation',
      schemaName,
      isPOS
    )) as string | null;
  }

  async getPOSTransactedAmount(
    fromDate: Date,
    toDate: Date
  ): Promise<Record<string, Money> | undefined> {
    return (await this.#demux.callBespoke(
      'getPOSTransactedAmount',
      fromDate,
      toDate
    )) as Promise<Record<string, Money> | undefined>;
  }

  async getLinkedEntries(
    schemaName: string,
    name: string
  ): Promise<Record<string, string[]>> {
    return (await this.#demux.callBespoke(
      'getLinkedEntries',
      schemaName,
      name
    )) as Record<string, string[]>;
  }

  async getReportData<T>(query: ReportQuery, ...args: unknown[]): Promise<T> {
    return (await this.#demux.callBespoke(query, ...args)) as T;
  }

  async getOpenPOSShift(): Promise<string | null> {
    return (await this.#demux.callBespoke('getOpenPOSShift')) as string | null;
  }

  /** Unused names from the item's batch or serial-number series, reserved on the server. */
  async getNewSeriesNames(
    schemaName: 'Batch' | 'SerialNumber',
    item: string,
    count: number
  ): Promise<string[]> {
    return (await this.#demux.callBespoke(
      'getNewSeriesNames',
      schemaName,
      item,
      count
    )) as string[];
  }

  async getDefaultNumberSeries(): Promise<Record<string, string>> {
    return (await this.#demux.callBespoke('getDefaultNumberSeries')) as Record<
      string,
      string
    >;
  }

  /**
   * Internal methods
   */
  async #getAll(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<RawValueMap[]> {
    return (await this.#demux.call(
      'getAll',
      schemaName,
      options
    )) as RawValueMap[];
  }

  #setFieldMap() {
    this.#fieldMap = Object.values(this.schemaMap).reduce((acc, sch) => {
      if (!sch?.name) {
        return acc;
      }

      acc[sch?.name] = getMapFromList(sch?.fields, 'fieldname');
      return acc;
    }, {} as FieldMap);
  }
}
