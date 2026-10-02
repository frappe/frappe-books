import type { BadgeProps } from 'frappe-ui';
import type { Fyo } from 'fyo';
import type { DocValue } from 'fyo/core/types';
import type { SystemSettings } from 'models/baseModels/SystemSettings/SystemSettings';
import type { FieldType, Schema, SelectOption } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import type { RouteLocationRaw, Router } from 'vue-router';
import type { FrappeDoc } from 'src/frappe/document';
import type { AccountingSettings } from 'models/baseModels/AccountingSettings/AccountingSettings';
import type { GetStarted } from 'models/baseModels/GetStarted/GetStarted';
import type { Defaults } from 'models/baseModels/Defaults/Defaults';
import type { PrintSettings } from 'models/baseModels/PrintSettings/PrintSettings';
import type { InventorySettings } from 'models/inventory/InventorySettings';
import type { Misc } from 'models/baseModels/Misc';
import type { POSSettings } from 'models/inventory/Point of Sale/POSSettings';

/**
 * Functions a model sets on its documents to decide a field dynamically;
 * they read the document through `this`.
 *
 * - `Validation`: throws if the value is invalid.
 * - `Required`, `Hidden`, `ReadOnly`: whether the field is so.
 */
export type Validation = (value: DocValue) => Promise<void> | void;
export type Required = () => boolean;
export type Hidden = () => boolean;
export type ReadOnly = () => boolean;
export type GetCurrency = () => string;

export type ValidationMap = Record<string, Validation | undefined>;
export type RequiredMap = Record<string, Required | undefined>;
export type CurrenciesMap = Record<string, GetCurrency | undefined>;
export type HiddenMap = Record<string, Hidden | undefined>;
export type ReadOnlyMap = Record<string, ReadOnly | undefined>;

export type ChangeArg = { doc: FrappeDoc; changed?: string };

export interface DocumentActionWarning {
  doc: FrappeDoc;
  action: 'save' | 'submit';
  message: string;
  errors: unknown[];
}

export interface SinglesMap {
  SystemSettings?: SystemSettings;
  AccountingSettings?: AccountingSettings;
  InventorySettings?: InventorySettings;
  POSSettings?: POSSettings;
  PrintSettings?: PrintSettings;
  Defaults?: Defaults;
  Misc?: Misc;
  GetStarted?: GetStarted;
  [key: string]: FrappeDoc | undefined;
}

// Static Config properties

export type FilterFunction = (doc: FrappeDoc) => Filter[] | Promise<Filter[]>;
export type FiltersMap = Record<string, FilterFunction>;

export type EmptyMessageFunction = (doc: FrappeDoc) => string;
export type EmptyMessageMap = Record<string, EmptyMessageFunction>;

export type ListFunction = (doc?: FrappeDoc) => string[] | SelectOption[];
export type ListsMap = Record<string, ListFunction | undefined>;

export interface Action {
  label: string;
  action: (doc: FrappeDoc, router: Router) => Promise<void> | void | unknown;
  condition?: (doc: FrappeDoc) => boolean;
  group?: string;
  type?: 'primary' | 'secondary';
  theme?: 'gray' | 'red';
  /** Phones show this label on a bottom-bar button that runs the action. */
  nextStep?: (doc: FrappeDoc) => string;
}

export interface RenderData {
  schema: Schema;
  [key: string]: DocValue | Schema;
}

export type BadgeTheme = NonNullable<BadgeProps['theme']>;
export type BadgeData = { label: string; theme: BadgeTheme };

export type ColumnConfig = {
  options?: SelectOption[];
  label: string;
  fieldtype: FieldType;
  fieldname: string;
  badge?: (doc: RenderData) => BadgeData;
  display?: (value: unknown, fyo: Fyo) => string;
};

export type ListViewColumn = string | ColumnConfig;
export interface ListViewSettings {
  formRoute?: (name: string) => RouteLocationRaw;
  columns?: ListViewColumn[];
}

export interface TreeViewSettings {
  parentField: string;
  getRootLabel: () => Promise<string>;
}

export type LeadStatus =
  | ''
  | 'Open'
  | 'Replied'
  | 'Interested'
  | 'Opportunity'
  | 'Converted'
  | 'Quotation'
  | 'Do not Contact';
