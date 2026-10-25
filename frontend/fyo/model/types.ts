import type { BadgeProps } from 'frappe-ui';
import type { Fyo } from 'fyo';
import type { DocValue } from 'fyo/core/types';
import type { SystemSettings } from 'models/baseModels/SystemSettings/SystemSettings';
import type { FieldType, Schema, SelectOption } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import type { RouteLocationRaw, Router } from 'vue-router';
import type { FrappeDoc } from 'src/frappe/document';
import type { AccountingSettings } from 'models/baseModels/AccountingSettings/AccountingSettings';
import type { Company } from 'models/baseModels/Company/Company';
import type { GetStarted } from 'models/baseModels/GetStarted/GetStarted';
import type { Defaults } from 'models/baseModels/Defaults/Defaults';
import type { PrintSettings } from 'models/baseModels/PrintSettings/PrintSettings';
import type { InventorySettings } from 'models/inventory/InventorySettings';
import type { Misc } from 'models/baseModels/Misc';
import type { ERPNextSettings } from 'models/baseModels/ERPNextSettings/ERPNextSettings';
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
  /** The one Books Company, which Settings edits with the settings singles. */
  Company?: Company;
  InventorySettings?: InventorySettings;
  POSSettings?: POSSettings;
  PrintSettings?: PrintSettings;
  Defaults?: Defaults;
  Misc?: Misc;
  ERPNextSettings?: ERPNextSettings;
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
  badge?: (doc: RenderData) => BadgeData | undefined;
  display?: (value: unknown, fyo: Fyo) => string;
};

export type ListViewColumn = string | ColumnConfig;

/** Records of another schema that link a saved document, which its form lists read only. */
export interface LinkedRecords {
  schemaName: string;
  /** The records' field that holds the document's name. */
  linkField: string;
  label: string;
  columns: ListViewColumn[];
  addLabel: string;
  emptyMessage: string;
  /** A from and to date pair that a phone row shows as one range. */
  dateRange?: [string, string];
  /** The records link to documents by their `links` rows, as Frappe's Addresses do, so `linkField` is `links`. */
  dynamicLink?: boolean;
}
/** What an empty list says, where it says more than "No entries found". */
export interface ListEmptyState {
  title: string;
  description?: string;
  createLabel?: string;
  /** The title when filters leave no rows. */
  filteredTitle?: string;
}

/** A bar of filters above a list: a search box and one Link field's records. */
export interface ListFilterBar {
  searchPlaceholder: string;
  linkField: string;
  /** What the Link filter says while it shows every record, e.g. "All price lists". */
  allLabel: string;
}

export interface ListViewSettings {
  formRoute?: (name: string) => RouteLocationRaw;
  columns?: ListViewColumn[];
  emptyState?: ListEmptyState;
  filterBar?: ListFilterBar;
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
