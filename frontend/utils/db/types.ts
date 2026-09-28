// These classes define the boundary between Fyo and the Frappe database API.

import type { SchemaMap } from 'schemas/types';

type UnknownMap = Record<string, unknown>;
export abstract class DatabaseBase {
  // Create
  abstract insert(
    schemaName: string,
    fieldValueMap: UnknownMap
  ): Promise<UnknownMap>;

  // Read
  abstract get(
    schemaName: string,
    name: string,
    fields?: string | string[]
  ): Promise<UnknownMap>;

  abstract getAll(
    schemaName: string,
    options: GetAllOptions
  ): Promise<UnknownMap[]>;

  abstract count(schemaName: string, options: GetAllOptions): Promise<number>;

  abstract search(
    text: string,
    fieldsBySchema: Record<string, string[]>,
    limit: number
  ): Promise<Record<string, UnknownMap[]>>;

  abstract getSingleValues(
    ...fieldnames: { fieldname: string; parent: string }[]
  ): Promise<{ fieldname: string; parent: string; value: unknown }[]>;

  // Update
  abstract rename(
    schemaName: string,
    oldName: string,
    newName: string
  ): Promise<void>;

  abstract update(
    schemaName: string,
    fieldValueMap: UnknownMap,
    expectedModified?: Date
  ): Promise<UnknownMap>;

  // Delete
  abstract delete(schemaName: string, name: string): Promise<void>;

  abstract deleteAll(schemaName: string, filters: QueryFilter): Promise<number>;

  // Other
  abstract exists(schemaName: string, name?: string): Promise<boolean>;

  abstract preview(
    schemaName: string,
    fieldValueMap: UnknownMap,
    name?: string
  ): Promise<UnknownMap>;

  abstract getMapped(
    schemaName: string,
    method: string,
    sourceName: string
  ): Promise<UnknownMap>;
}

export type DatabaseMethod = keyof DatabaseBase;

export interface GetAllOptions {
  fields?: string[];
  filters?: QueryFilter;
  offset?: number;
  limit?: number;
  groupBy?: string | string[];
  orderBy?: string | string[];
  order?: 'asc' | 'desc';
}

export type QueryFilter = Record<
  string,
  boolean | string | null | (string | number | (string | number | null)[])[]
>;

export type SingleValue<T> = {
  fieldname: string;
  parent: string;
  value: T;
}[];

// The Frappe adapter implements this database boundary.
export abstract class DatabaseDemuxBase {
  abstract getSchemaMap(): Promise<SchemaMap> | SchemaMap;

  abstract connect(countryCode?: string): Promise<string>;

  abstract call(method: DatabaseMethod, ...args: unknown[]): Promise<unknown>;

  abstract callBespoke(method: string, ...args: unknown[]): Promise<unknown>;

  abstract runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string
  ): Promise<unknown>;
}

// Return types of Bespoke Queries
export type TopExpenses = { account: string; total: number }[];
export type TotalOutstanding = { total: number; outstanding: number };
export type Cashflow = { inflow: number; outflow: number; yearmonth: string }[];
export type Balance = { balance: number; yearmonth: string }[];
export type IncomeExpense = { income: Balance; expense: Balance };
export type TotalCreditAndDebit = {
  account: string;
  totalCredit: number;
  totalDebit: number;
};
