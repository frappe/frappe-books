import type { RawValueMap } from 'fyo/core/types';

export type UnknownMap = Record<string, unknown>;
export type Translation = { translation: string; context?: string };
export type LanguageMap = Record<string, Translation>;

export type CountryInfoMap = Record<string, CountryInfo | undefined>;
/** What Books knows of a country beyond Frappe's country data. */
export interface CountryInfo {
  fiscal_year_start?: string;
  fiscal_year_end?: string;
  locale?: string;
}

/** A chart of accounts the server can create in the setup wizard. */
export interface ChartOfAccounts {
  name: string;
  label: string;
  country_code: string;
  language: string | null;
}

export interface SelectFileOptions {
  title: string;
  filters?: { name: string; extensions: string[] }[];
}

export type PropertyEnum<T extends Record<string, any>> = {
  [key in keyof Required<T>]: key;
};

export interface Keys extends ModMap {
  pressed: Set<string>;
}

interface ModMap {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  repeat: boolean;
}

export const searchGroups = [
  'Docs',
  'List',
  'Create',
  'Report',
  'Page',
  'Recent',
] as const;

export type SearchGroup = typeof searchGroups[number];

export interface SearchItem {
  label: string;
  group: Exclude<SearchGroup, 'Docs' | 'Recent'>;
  route?: string;
  action?: () => void | Promise<void>;
  schemaName?: string;
  initData?: RawValueMap;
}
