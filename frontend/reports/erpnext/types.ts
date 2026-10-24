import type { PhoneLayout } from 'reports/types';

/** Filter values of a report, by ERPNext fieldname. */
export type FilterValues = Record<string, unknown>;

export type SelectOptions =
  string | (string | { label: string; value: string })[];

/**
 * A report filter as ERPNext's report JS defines it. `fieldname`, `label`,
 * `fieldtype`, `options`, `default`, `reqd`, `depends_on` and
 * `mandatory_depends_on` copy ERPNext's, so the drift check can compare them;
 * the other keys are Books' own.
 */
export interface ERPNextFilter {
  fieldname: string;
  label: string;
  fieldtype:
    | 'Link'
    | 'Date'
    | 'Select'
    | 'Check'
    | 'Data'
    | 'MultiSelectList'
    | 'Autocomplete';
  /** A doctype, the fieldname of the filter naming one, Select options, or an option token. */
  options?: SelectOptions;
  /** A value, or a token of what ERPNext's JS works out when it loads. */
  default?: string | number | string[];
  reqd?: 1;
  depends_on?: string;
  mandatory_depends_on?: string;
  /** Books: sent with its default, not shown. */
  hidden?: 1;
  /** Books: a Link's or MultiSelectList's search filters, as ERPNext's get_query or get_data sets them. */
  linkFilters?: (values: FilterValues) => Record<string, unknown>;
}

/** An ERPNext report as Books shows it in accessory mode. */
export interface ERPNextReportDefinition {
  /** The ERPNext Report. */
  reportName: string;
  title: string;
  /** ERPNext's report JS that defines the filters, for the drift check. */
  source: string;
  filters: ERPNextFilter[];
  isInventory?: boolean;
  /** Rows are accounts: they indent, groups fold, and the account column shows the account name. */
  tree?: boolean;
  /** Select filters shown as tabs. */
  tabs?: string[];
  phoneLayout?: PhoneLayout;
  /** Values (or default tokens) ERPNext's `onload` sets, over the filters' defaults. */
  onLoad?: Record<string, string | number>;
  /** Other filters' values set when a filter changes, as ERPNext's `on_change` sets them. */
  onChange?: Record<
    string,
    (values: FilterValues) => Promise<FilterValues> | FilterValues
  >;
}
