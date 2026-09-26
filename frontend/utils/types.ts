import type { RawValueMap } from 'fyo/core/types';

export type UnknownMap = Record<string, unknown>;
export type Translation = { translation: string; context?: string };
export type LanguageMap = Record<string, Translation>;

export type CountryInfoMap = Record<string, CountryInfo | undefined>;
export interface CountryInfo {
  code: string;
  currency: string;
  currency_fraction?: string;
  currency_fraction_units?: number;
  smallest_currency_fraction_value?: number;
  currency_symbol?: string;
  timezones?: string[];
  fiscal_year_start: string;
  fiscal_year_end: string;
  locale: string;
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
