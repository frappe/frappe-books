import { Fyo } from 'fyo';
import { ValueError } from 'fyo/utils/errors';
import Observable from 'fyo/utils/observable';
import { translateSchema } from 'fyo/utils/translation';
import { Field, RawValue, SchemaMap } from 'schemas/types';
import { getMapFromList } from 'utils';
import {
  Cashflow,
  DatabaseBase,
  DatabaseDemuxBase,
  GetAllOptions,
  IncomeExpense,
  QueryFilter,
  SingleValue,
  TopExpenses,
  TotalCreditAndDebit,
  TotalOutstanding,
} from 'utils/db/types';
import { schemaTranslateables } from 'utils/translationHelpers';
import { LanguageMap } from 'utils/types';
import { Converter } from './converter';
import {
  DatabaseDemuxConstructor,
  DocValue,
  DocValueMap,
  RawValueMap,
} from './types';
import { ReturnDocItem } from 'models/inventory/types';
import { Money } from 'pesa';

type FieldMap = Record<string, Record<string, Field>>;

export class DatabaseHandler extends DatabaseBase {
  /* eslint-disable @typescript-eslint/no-floating-promises */
  #fyo: Fyo;
  converter: Converter;
  #demux: DatabaseDemuxBase;
  #connected = false;
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

  get isConnected() {
    return this.#connected;
  }

  async connect(countryCode?: string) {
    countryCode = await this.#demux.connect(countryCode);
    await this.init();
    this.#connected = true;
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

  async translateSchemaMap(languageMap?: LanguageMap) {
    if (languageMap) {
      translateSchema(this.#schemaMap, languageMap, schemaTranslateables);
    } else {
      await this.refreshSchemaMap();
    }
  }

  async purgeCache() {
    await this.close();
    this.#connected = false;
    this.#schemaMap = {};
    this.#fieldMap = {};
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
    this.observer.trigger(`insert:${schemaName}`, docValueMap);
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
    this.observer.trigger(`get:${schemaName}`, { name, fields });
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  async getAll(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<DocValueMap[]> {
    const rawValueMap = await this.#getAll(schemaName, options);

    this.observer.trigger(`getAll:${schemaName}`, options);
    return this.converter.toDocValueMap(
      schemaName,
      rawValueMap
    ) as DocValueMap[];
  }

  async getAllRaw(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<RawValueMap[]> {
    const all = await this.#getAll(schemaName, options);

    this.observer.trigger(`getAllRaw:${schemaName}`, options);
    return all;
  }

  async getSingleValues(
    ...fieldnames: ({ fieldname: string; parent?: string } | string)[]
  ): Promise<SingleValue<DocValue>> {
    const rawSingleValue = (await this.#demux.call(
      'getSingleValues',
      ...fieldnames
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

    this.observer.trigger(`getSingleValues`, fieldnames);
    return docSingleValue;
  }

  async count(
    schemaName: string,
    options: GetAllOptions = {}
  ): Promise<number> {
    const rawValueMap = await this.#getAll(schemaName, options);
    const count = rawValueMap.length;

    this.observer.trigger(`count:${schemaName}`, options);
    return count;
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

    this.observer.trigger(`update:${schemaName}`, docValueMap);
    return this.converter.toDocValueMap(
      schemaName,
      updatedRawValueMap
    ) as DocValueMap;
  }

  async runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.runLifecycleAction(
      action,
      schemaName,
      name
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  // Delete
  async delete(schemaName: string, name: string): Promise<void> {
    await this.#demux.call('delete', schemaName, name);

    this.observer.trigger(`delete:${schemaName}`, name);
  }

  async deleteAll(schemaName: string, filters: QueryFilter): Promise<number> {
    const count = (await this.#demux.call(
      'deleteAll',
      schemaName,
      filters
    )) as number;

    this.observer.trigger(`deleteAll:${schemaName}`, filters);
    return count;
  }

  // Other
  async exists(schemaName: string, name?: string): Promise<boolean> {
    const doesExist = (await this.#demux.call(
      'exists',
      schemaName,
      name
    )) as boolean;

    this.observer.trigger(`exists:${schemaName}`, name);
    return doesExist;
  }

  async close(): Promise<void> {
    await this.#demux.call('close');
  }

  // The Frappe adapter runs these complex queries on the server.

  async getLastInserted(schemaName: string): Promise<number> {
    if (this.schemaMap[schemaName]?.naming !== 'autoincrement') {
      throw new ValueError(
        `invalid schema, ${schemaName} does not have autoincrement naming`
      );
    }

    return (await this.#demux.callBespoke(
      'getLastInserted',
      schemaName
    )) as number;
  }

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

  async getReturnBalanceItemsQty(
    schemaName: string,
    docName: string
  ): Promise<Record<string, ReturnDocItem> | undefined> {
    return (await this.#demux.callBespoke(
      'getReturnBalanceItemsQty',
      schemaName,
      docName
    )) as Promise<Record<string, ReturnDocItem> | undefined>;
  }

  async getPOSTransactedAmount(
    fromDate: Date,
    toDate: Date,
    lastShiftClosingDate?: Date
  ): Promise<Record<string, Money> | undefined> {
    return (await this.#demux.callBespoke(
      'getPOSTransactedAmount',
      fromDate,
      toDate,
      lastShiftClosingDate
    )) as Promise<Record<string, Money> | undefined>;
  }

  async getOpenPOSShift(): Promise<string | null> {
    return (await this.#demux.callBespoke('getOpenPOSShift')) as string | null;
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
