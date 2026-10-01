import { Fyo } from 'fyo';
import Observable from 'fyo/utils/observable';
import type { DocPermissionMap } from 'fyo/utils/permissions';
import { Field, RawValue, SchemaMap } from 'schemas/types';
import { getMapFromList } from 'utils';
import {
  DatabaseBase,
  DatabaseDemuxBase,
  GetAllOptions,
  LinkedDoc,
  QueryFilter,
  SingleValue,
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
      options.filters ?? {},
      options.orFilters ?? {}
    )) as number;
  }

  /** A page of link options that Frappe's link search finds for `text`. */
  async searchLink(
    schemaName: string,
    text: string,
    filters: QueryFilter | null,
    fields: string[],
    limit: number
  ): Promise<DocValueMap[]> {
    const rawValueMaps = (await this.#demux.call(
      'searchLink',
      schemaName,
      text,
      filters,
      fields,
      limit
    )) as RawValueMap[];
    return this.converter.toDocValueMap(
      schemaName,
      rawValueMaps
    ) as DocValueMap[];
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
    docValueMap: DocValueMap
  ): Promise<DocValueMap> {
    const rawValueMap = this.converter.toRawValueMap(
      schemaName,
      docValueMap
    ) as RawValueMap;
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

  /** Submits or cancels a doc, which the server refuses if it changed after `modified`. */
  async runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string,
    modified: string,
    linkedDocs?: LinkedDoc[]
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.runLifecycleAction(
      action,
      schemaName,
      name,
      modified,
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
    const previewed = (await this.#demux.runDocMethod(
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

  /** An unsaved copy of a document's values, without the values Frappe marks no_copy. */
  async getDuplicate(
    schemaName: string,
    docValueMap: DocValueMap
  ): Promise<DocValueMap> {
    const rawValueMap = (await this.#demux.getDuplicate(
      schemaName,
      this.converter.toRawValueMap(schemaName, docValueMap)
    )) as RawValueMap;
    return this.converter.toDocValueMap(schemaName, rawValueMap) as DocValueMap;
  }

  /** The user's rights on one saved document, as Frappe grants them. */
  async getDocPermissions(
    doctype: string,
    name: string
  ): Promise<DocPermissionMap | undefined> {
    return (await this.#demux.getDocPermissions(doctype, name)) as
      DocPermissionMap | undefined;
  }

  // The Frappe adapter runs these complex queries on the server.

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

  async getOpenPOSShift(): Promise<string | null> {
    return (await this.#demux.callBespoke('getOpenPOSShift')) as string | null;
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
