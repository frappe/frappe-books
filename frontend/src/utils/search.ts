import { Fyo, t } from 'fyo';
import { RawValueMap } from 'fyo/core/types';
import { groupBy } from 'lodash';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports';
import { OptionField } from 'schemas/types';
import type { DocValues } from 'src/frappe/api';
import {
  getAllSchemaNames,
  getField,
  getSchema,
  toSchemaName,
} from 'src/frappe/registry';
import {
  getSearchables,
  getSeriesPrefixes,
  searchDocuments,
  type Searchable,
} from 'src/frappe/search';
import { getImportableSchemaNames } from 'src/importer';
import { createFilters, routeFilters } from 'src/utils/filters';
import { safeParseFloat } from 'utils/index';
import { fuzzyMatch } from '.';
import { canOpen } from './sidebarConfig';
import { getFormRoute, openNewDoc, routeTo } from './ui';
import { searchGroups } from '../../utils/types';
import type { SearchGroup, SearchItem } from '../../utils/types';

export { searchGroups };
export type { SearchGroup, SearchItem };

interface StoredRecentItem {
  label: string;
  group: string;
  route?: string;
  schemaName?: string;
  reportName?: string;
  initData?: RawValueMap;
  timestamp: number;
}

interface DocSearchItem extends Omit<SearchItem, 'group'> {
  group: 'Docs';
  schemaLabel: string;
  more: string[];
}

interface RecentSearchItem extends Omit<SearchItem, 'group'> {
  group: 'Recent';
}

export type SearchItems = (DocSearchItem | SearchItem | RecentSearchItem)[];

const DOC_RESULT_LIMIT = 20;

interface Keyword {
  values: string[];
  meta: Record<string, string | number | undefined>;
  priority: number;
}

interface SearchFilters {
  groupFilters: Record<SearchGroup, boolean>;
  skipTables: boolean;
  skipTransactions: boolean;
  schemaFilters: Record<string, boolean>;
}

export function getGroupLabelMap() {
  return {
    Create: t`Create`,
    List: t`List`,
    Report: t`Report`,
    Docs: t`Docs`,
    Page: t`Page`,
    Recent: t`Recent`,
  };
}

export const groupThemeMap: Record<
  SearchGroup,
  'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet'
> = {
  Docs: 'blue',
  Create: 'green',
  List: 'violet',
  Report: 'amber',
  Page: 'red',
  Recent: 'gray',
};

function getCreateList(fyo: Fyo): SearchItem[] {
  const hasInventory = fyo.singles.AccountingSettings?.enable_inventory;
  const formEditCreateList = [
    ModelNameEnum.SalesInvoice,
    ModelNameEnum.PurchaseInvoice,
    ModelNameEnum.JournalEntry,
    ...(hasInventory
      ? [
          ModelNameEnum.Shipment,
          ModelNameEnum.PurchaseReceipt,
          ModelNameEnum.StockMovement,
        ]
      : []),
  ].map(
    (schemaName) =>
      ({
        label: getSchema(schemaName)?.label,
        group: 'Create',
        action: () => openNewDoc(schemaName),
        schemaName,
      }) as SearchItem
  );

  const filteredCreateList = [
    {
      label: t`Sales Payment`,
      schemaName: ModelNameEnum.Payment,
      create: createFilters.SalesPayments,
    },
    {
      label: t`Purchase Payment`,
      schemaName: ModelNameEnum.Payment,
      create: createFilters.PurchasePayments,
    },
    {
      label: t`Customer`,
      schemaName: ModelNameEnum.Party,
      create: createFilters.Customers,
    },
    {
      label: t`Supplier`,
      schemaName: ModelNameEnum.Party,
      create: createFilters.Suppliers,
    },
    {
      label: t`Party`,
      schemaName: ModelNameEnum.Party,
      create: createFilters.Party,
    },
    {
      label: t`Sales Item`,
      schemaName: ModelNameEnum.Item,
      create: createFilters.SalesItems,
    },
    {
      label: t`Purchase Item`,
      schemaName: ModelNameEnum.Item,
      create: createFilters.PurchaseItems,
    },
    {
      label: t`Item`,
      schemaName: ModelNameEnum.Item,
      create: createFilters.Items,
    },
  ].map(({ label, create, schemaName }) => {
    return {
      label,
      group: 'Create',
      action: () => openNewDoc(schemaName, create),
      schemaName,
      initData: create,
    } as SearchItem;
  });

  return [formEditCreateList, filteredCreateList]
    .flat()
    .filter((item) => fyo.can(item.schemaName!, 'create'));
}

function getReportList(fyo: Fyo): SearchItem[] {
  const hasGstin = !!fyo.singles?.AccountingSettings?.gstin;
  const hasInventory = !!fyo.singles?.AccountingSettings?.enable_inventory;
  const reportNames = Object.keys(reports) as (keyof typeof reports)[];
  return reportNames
    .filter((r) => {
      const report = reports[r];
      if (report.isInventory && !hasInventory) {
        return false;
      }

      if (report.title.startsWith('GST') && !hasGstin) {
        return false;
      }
      return true;
    })
    .map((r) => {
      const report = reports[r];
      return {
        label: report.title,
        route: `/report/${r}`,
        group: 'Report',
      } as SearchItem;
    })
    .filter((item) => canOpen(item.route!));
}

/** Schemas of the features that are turned off, whose lists are not offered. */
function getSwitchedOffSchemaNames(fyo: Fyo): string[] {
  const accounting = fyo.singles.AccountingSettings;
  const inventory = fyo.singles.InventorySettings;
  const features: [boolean | undefined, ModelNameEnum[]][] = [
    [
      accounting?.enable_inventory,
      [
        ModelNameEnum.StockMovement,
        ModelNameEnum.Shipment,
        ModelNameEnum.PurchaseReceipt,
        ModelNameEnum.Location,
        ModelNameEnum.StockLedgerEntry,
      ],
    ],
    [accounting?.enable_price_list, [ModelNameEnum.PriceList]],
    [accounting?.enable_pricing_rule, [ModelNameEnum.PricingRule]],
    [accounting?.enable_coupon_code, [ModelNameEnum.CouponCode]],
    [accounting?.enable_lead, [ModelNameEnum.Lead]],
    [
      accounting?.enable_loyalty_program,
      [ModelNameEnum.LoyaltyProgram, ModelNameEnum.LoyaltyPointEntry],
    ],
    [accounting?.enableitem_group, [ModelNameEnum.ItemGroup]],
    [accounting?.enable_form_customization, [ModelNameEnum.CustomForm]],
    [inventory?.enable_batches, [ModelNameEnum.Batch]],
    [inventory?.enable_serial_number, [ModelNameEnum.SerialNumber]],
    [
      inventory?.enable_point_of_sale,
      [
        ModelNameEnum.POSProfile,
        ModelNameEnum.POSOpeningShift,
        ModelNameEnum.POSClosingShift,
        ModelNameEnum.ItemEnquiry,
      ],
    ],
  ];

  return features.filter(([isOn]) => !isOn).flatMap(([, names]) => names);
}

function getListViewList(fyo: Fyo): SearchItem[] {
  const switchedOff = getSwitchedOffSchemaNames(fyo);
  const standardLists = getAllSchemaNames()
    .filter((s) => !switchedOff.includes(s))
    .map((s) => getSchema(s))
    .filter((s) => s && !s.isChild && !s.isSingle)
    .map(
      (s) =>
        ({
          label: s!.label,
          route: `/list/${s!.name}`,
          group: 'List',
        }) as SearchItem
    );

  const filteredLists = [
    {
      label: t`Customers`,
      route: `/list/Party/${t`Customers`}`,
      filters: routeFilters.Customers,
    },
    {
      label: t`Suppliers`,
      route: `/list/Party/${t`Suppliers`}`,
      filters: routeFilters.Suppliers,
    },
    {
      label: t`Sales Items`,
      route: `/list/Item/${t`Sales Items`}`,
      filters: routeFilters.SalesItems,
    },
    {
      label: t`Sales Payments`,
      route: `/list/Payment/${t`Sales Payments`}`,
      filters: routeFilters.SalesPayments,
    },
    {
      label: t`Purchase Items`,
      route: `/list/Item/${t`Purchase Items`}`,
      filters: routeFilters.PurchaseItems,
    },
    {
      label: t`Items`,
      route: `/list/Item/${t`Items`}`,
      filters: routeFilters.Items,
    },
    {
      label: t`Purchase Payments`,
      route: `/list/Payment/${t`Purchase Payments`}`,
      filters: routeFilters.PurchasePayments,
    },
  ].map((i) => {
    const label = i.label;
    const route = encodeURI(`${i.route}?filters=${JSON.stringify(i.filters)}`);

    return { label, route, group: 'List' } as SearchItem;
  });

  return [standardLists, filteredLists]
    .flat()
    .filter((item) => canOpen(item.route!));
}

function getSetupList(fyo: Fyo): SearchItem[] {
  const pages: SearchItem[] = [
    {
      label: t`Dashboard`,
      route: '/',
      group: 'Page',
    },
    {
      label: t`Chart of Accounts`,
      route: '/chart-of-accounts',
      group: 'Page',
    },
    {
      label: t`Import Wizard`,
      route: '/import-wizard',
      group: 'Page',
    },
    {
      label: t`Settings`,
      route: '/settings',
      group: 'Page',
    },
  ];
  const canImport = getImportableSchemaNames(fyo).length > 0;
  return pages.filter((page) => canImport || page.route !== '/import-wizard');
}

function getNonDocSearchList(fyo: Fyo) {
  return [
    getListViewList(fyo),
    getCreateList(fyo),
    getReportList(fyo),
    getSetupList(fyo),
  ]
    .flat()
    .map((d) => {
      if (d.route && !d.action) {
        d.action = async () => {
          await routeTo(d.route!);
        };
      }
      return d;
    });
}

export class Search {
  /**
   * A simple fuzzy searcher.
   *
   * How the Search works:
   * - Typed input fetches a bounded set of matching docs from the server,
   *   matched on the DocType search fields.
   * - `name` or `parent` (parent doc's name) is used as the main
   *   label.
   * - The search field values and schema label are used as
   *   search target terms.
   * - Input is split on `' '` (whitespace) and each part has to completely
   *   or partially match the search target terms.
   * - Non matches are ignored.
   */

  _docRequestId = 0;
  recentKey = 'searchRecents';
  searchables: Record<string, Searchable>;
  seriesPrefixes?: Record<string, string[]>;
  keywords: Record<string, Keyword[]>;
  priorityMap: Record<string, number> = {
    [ModelNameEnum.SalesInvoice]: 125,
    [ModelNameEnum.PurchaseInvoice]: 100,
    [ModelNameEnum.Payment]: 75,
    [ModelNameEnum.StockMovement]: 75,
    [ModelNameEnum.Shipment]: 75,
    [ModelNameEnum.PurchaseReceipt]: 75,
    [ModelNameEnum.Item]: 50,
    [ModelNameEnum.Party]: 50,
    [ModelNameEnum.JournalEntry]: 50,
  };

  filters: SearchFilters = {
    groupFilters: {
      List: true,
      Report: true,
      Create: true,
      Page: true,
      Docs: true,
      Recent: true,
    },
    schemaFilters: {},
    skipTables: false,
    skipTransactions: false,
  };

  fyo: Fyo;

  _nonDocSearchList: SearchItem[];
  _groupLabelMap?: Record<SearchGroup, string>;

  maxRecentItems = 10;
  recentExpiryDays = 30;

  constructor(fyo: Fyo) {
    this.fyo = fyo;
    this.keywords = {};
    this.searchables = {};
    this._nonDocSearchList = getNonDocSearchList(fyo);
  }

  /**
   * these getters are used for hacky two way binding between the
   * `skipT*` filters and the `schemaFilters`.
   */

  private _loadAndCleanRecentItems(): StoredRecentItem[] {
    try {
      const raw = localStorage.getItem(this.recentKey);
      return raw ? (JSON.parse(raw) as StoredRecentItem[]) : [];
    } catch {
      return [];
    }
  }

  private _saveRecentItems(items: StoredRecentItem[]) {
    localStorage.setItem(this.recentKey, JSON.stringify(items));
  }

  addToRecent(item: SearchItems[number]) {
    const recents = this._loadAndCleanRecentItems();

    const recentItem: StoredRecentItem = {
      label: item.label,
      group: item.group,
      timestamp: Date.now(),
    };

    if ('route' in item && item.route) {
      recentItem.route = item.route;
    } else if (item.group === 'Docs') {
      recentItem.schemaName = item.schemaLabel;
    } else if (item.group === 'Create') {
      recentItem.schemaName = item.schemaName;
      recentItem.initData = item.initData;
    }

    const updatedRecents = [
      recentItem,
      ...recents.filter((r) => r.label !== recentItem.label),
    ].slice(0, this.maxRecentItems);

    this._saveRecentItems(updatedRecents);
  }

  getRecentItems(searchTerm?: string): RecentSearchItem[] {
    try {
      const recents = this._loadAndCleanRecentItems();

      let filtered = recents;
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = recents.filter(
          (item) =>
            item.label.toLowerCase().includes(lower) ||
            item.group.toLowerCase().includes(lower)
        );
      }

      const result = filtered.map((item) => ({
        label: item.label,
        group: 'Recent' as const,
        action: () => this._executeRecentAction(item),
        route: item.route,
      }));

      return result;
    } catch {
      return [];
    }
  }

  private _executeRecentAction(item: StoredRecentItem) {
    if (item.route) {
      void routeTo(item.route);
    } else if (item.schemaName && item.group === 'Create') {
      void openNewDoc(item.schemaName, item.initData);
    } else if (item.schemaName) {
      this._openDocList(item.schemaName);
    } else if (item.reportName) {
      this._openReport(item.reportName);
    }
  }

  private _openDocList(schemaName: string) {
    const route = `/list/${schemaName}`;
    void routeTo(route);
  }

  private _openReport(reportName: string) {
    const route = `/report/${reportName}`;
    void routeTo(route);
  }

  get skipTables() {
    let value = true;
    for (const val of Object.values(this.searchables)) {
      if (!val.isChild) {
        continue;
      }

      value &&= !this.filters.schemaFilters[val.schemaName];
    }
    return value;
  }

  get skipTransactions() {
    let value = true;
    for (const val of Object.values(this.searchables)) {
      if (!val.isSubmittable) {
        continue;
      }

      value &&= !this.filters.schemaFilters[val.schemaName];
    }
    return value;
  }

  /** Schema filter chips: transactions first, child tables last. */
  get schemaFilterOptions(): { value: string; label: string }[] {
    return Object.values(this.searchables)
      .map(({ schemaName, isChild, isSubmittable }) => ({
        value: schemaName,
        label: getSchema(schemaName)?.label ?? schemaName,
        index: isSubmittable ? 0 : isChild ? 2 : 1,
      }))
      .sort((a, b) => a.index - b.index);
  }

  isFilterOn(filterName: string): boolean {
    if (filterName in this.filters.groupFilters) {
      return this.filters.groupFilters[filterName as SearchGroup];
    }

    if (filterName === 'skipTables' || filterName === 'skipTransactions') {
      return this.filters[filterName];
    }

    return !!this.filters.schemaFilters[filterName];
  }

  /** Filters that differ from the defaults; a skip filter counts once. */
  get changedFilterCount(): number {
    const { groupFilters, schemaFilters, skipTables, skipTransactions } =
      this.filters;
    const groups = searchGroups.filter((group) => !groupFilters[group]);
    const schemas = Object.values(this.searchables).filter(
      ({ schemaName, isChild, isSubmittable }) =>
        !schemaFilters[schemaName] &&
        !(isChild && skipTables) &&
        !(isSubmittable && skipTransactions)
    );

    return (
      groups.length +
      schemas.length +
      Number(skipTables) +
      Number(skipTransactions)
    );
  }

  resetFilters() {
    for (const group of searchGroups) {
      this.filters.groupFilters[group] = true;
    }

    this.filters.skipTables = false;
    this.filters.skipTransactions = false;
    this._setSchemaFilters();
  }

  set(filterName: string, value: boolean) {
    if (filterName in this.filters.groupFilters) {
      this.filters.groupFilters[filterName as SearchGroup] = value;
    } else if (filterName in this.searchables) {
      this.filters.schemaFilters[filterName] = value;
      this.filters.skipTables = this.skipTables;
      this.filters.skipTransactions = this.skipTransactions;
    } else if (filterName === 'skipTables') {
      Object.values(this.searchables)
        .filter(({ isChild }) => isChild)
        .forEach(({ schemaName }) => {
          this.filters.schemaFilters[schemaName] = !value;
        });
      this.filters.skipTables = value;
    } else if (filterName === 'skipTransactions') {
      Object.values(this.searchables)
        .filter(({ isSubmittable }) => isSubmittable)
        .forEach(({ schemaName }) => {
          this.filters.schemaFilters[schemaName] = !value;
        });
      this.filters.skipTransactions = value;
    }
  }

  initialize() {
    this._setSearchables();
    this._setSchemaFilters();
    this._groupLabelMap = getGroupLabelMap();
  }

  _setSchemaFilters() {
    for (const name in this.searchables) {
      this.filters.schemaFilters[name] = true;
    }
  }

  /** Loads the docs matching the input; returns false for a superseded request. */
  async fetchDocs(input?: string): Promise<boolean> {
    const requestId = ++this._docRequestId;
    const searchables = Object.values(this.searchables).filter((searchable) =>
      this._isSearchable(searchable)
    );
    const text = input?.trim();
    const results = text ? await this._searchDocuments(searchables, text) : [];
    if (requestId !== this._docRequestId) {
      return false;
    }

    this.keywords = {};
    searchables.forEach((searchable, index) =>
      this._setKeywords(results[index] ?? [], searchable)
    );

    return true;
  }

  async _searchDocuments(searchables: Searchable[], text: string) {
    this.seriesPrefixes ??= this.fyo.can(ModelNameEnum.NumberSeries, 'read')
      ? await getSeriesPrefixes()
      : {};
    const { seriesPrefixes } = this;
    return await Promise.all(
      searchables.map((searchable) =>
        searchDocuments(
          searchable,
          text,
          DOC_RESULT_LIMIT,
          seriesPrefixes[searchable.schemaName]
        )
      )
    );
  }

  _isSearchable(searchable: Searchable): boolean {
    if (
      !this.filters.groupFilters.Docs ||
      !this.filters.schemaFilters[searchable.schemaName]
    ) {
      return false;
    }

    if (searchable.isChild && this.filters.skipTables) {
      return false;
    }

    return !(searchable.isSubmittable && this.filters.skipTransactions);
  }

  search(input?: string): SearchItems {
    const groupedKeywords = this._getGroupedKeywords();
    const keys = Object.keys(groupedKeywords);
    if (!keys.includes('0')) {
      keys.push('0');
    }

    keys.sort((a, b) => safeParseFloat(b) - safeParseFloat(a));
    const array: SearchItems = [];

    const showRecent =
      !input ||
      input.startsWith('#') ||
      input.toLowerCase().startsWith('recent');
    if (showRecent && this.filters.groupFilters.Recent) {
      const recentSearchTerm = input?.replace(/^#|recent/gi, '').trim();
      const recentItems = this.getRecentItems(recentSearchTerm);
      if (recentItems.length > 0) {
        array.push(...recentItems);
      }
    }

    this._pushGroupedItems(keys, groupedKeywords, array, input);
    return array;
  }

  /**
   * Docs by priority group, with actions after group 0. Actions come first
   * when a typed word names their group, because a loose match such as
   * "create" in "Cloud Hosting - Shared Starter" would outrank them.
   */
  _pushGroupedItems(
    keys: string[],
    groupedKeywords: Record<string, Keyword[]>,
    array: SearchItems,
    input?: string
  ) {
    const actionsFirst = this._namesActionGroup(input);
    if (actionsFirst) {
      this._pushNonDocSearchItems(array, input);
    }

    for (const key of keys) {
      this._pushDocSearchItems(groupedKeywords[key] ?? [], array, input);
      if (key === '0' && !actionsFirst) {
        this._pushNonDocSearchItems(array, input);
      }
    }
  }

  /** Whether a typed word is an action group's name, such as "create". */
  _namesActionGroup(input?: string): boolean {
    const words = input?.toLowerCase().split(/\s+/) ?? [];
    return this._nonDocSearchList.some(({ group }) =>
      [group, this._groupLabelMap?.[group]].some(
        (name) => !!name && words.includes(name.toLowerCase())
      )
    );
  }

  _pushDocSearchItems(keywords: Keyword[], array: SearchItems, input?: string) {
    if (!input) {
      return;
    }

    if (!this.filters.groupFilters.Docs) {
      return;
    }

    const subArray = this._getSubSortedArray(keywords, input);
    array.push(...subArray);
  }

  _pushNonDocSearchItems(array: SearchItems, input?: string) {
    const filtered = this._nonDocSearchList.filter(
      (si) => this.filters.groupFilters[si.group]
    );
    const subArray = this._getSubSortedArray(filtered, input);
    array.push(...subArray);
  }

  _getSubSortedArray(
    items: (SearchItem | Keyword)[],
    input?: string
  ): SearchItems {
    const subArray: { item: SearchItems[number]; distance: number }[] = [];

    for (const item of items) {
      const subArrayItem = this._getSubArrayItem(item, input);
      if (!subArrayItem) {
        continue;
      }

      subArray.push(subArrayItem);
    }

    subArray.sort((a, b) => a.distance - b.distance);
    return subArray.map(({ item }) => item);
  }

  _getSubArrayItem(
    item: SearchItem | Keyword,
    input?: string
  ): { item: SearchItems[number]; distance: number } | null {
    if (isSearchItem(item)) {
      return this._getSubArrayItemFromSearchItem(item, input);
    }

    if (!input) {
      return null;
    }

    return this._getSubArrayItemFromKeyword(item, input);
  }

  _getSubArrayItemFromSearchItem(item: SearchItem, input?: string) {
    if (!input) {
      return { item, distance: 0 };
    }

    const values = this._getValueListFromSearchItem(item).filter(Boolean);
    const { isMatch, distance } = this._getMatchAndDistance(input, values);

    if (!isMatch) {
      return null;
    }

    return { item, distance };
  }

  _getValueListFromSearchItem({ label, group }: SearchItem): string[] {
    return [label, group];
  }

  _getSubArrayItemFromKeyword(item: Keyword, input: string) {
    const values = this._getValueListFromKeyword(item).filter(Boolean);
    const { isMatch, distance } = this._getMatchAndDistance(input, values);

    if (!isMatch) {
      return null;
    }

    return {
      item: this._getDocSearchItemFromKeyword(item),
      distance,
    };
  }

  _getValueListFromKeyword({ values, meta }: Keyword): string[] {
    const schemaLabel = meta.schemaName as string;
    return [values, schemaLabel].flat();
  }

  _getMatchAndDistance(input: string, values: string[]) {
    /**
     * All the parts should match with something.
     */

    let distance = Number.MAX_SAFE_INTEGER;
    for (const part of input.split(' ').filter(Boolean)) {
      const match = this._getInternalMatch(part, values);
      if (!match.isMatch) {
        return { isMatch: false, distance: Number.MAX_SAFE_INTEGER };
      }

      distance = match.distance < distance ? match.distance : distance;
    }

    return { isMatch: true, distance };
  }

  _getInternalMatch(input: string, values: string[]) {
    let isMatch = false;
    let distance = Number.MAX_SAFE_INTEGER;

    for (const k of values) {
      const match = fuzzyMatch(input, k);
      isMatch ||= match.isMatch;

      if (match.distance < distance) {
        distance = match.distance;
      }
    }

    return { isMatch, distance };
  }

  _getDocSearchItemFromKeyword(keyword: Keyword): DocSearchItem {
    const schemaName = keyword.meta.schemaName as string;
    const schemaLabel = getSchema(schemaName)?.label ?? schemaName;
    const route = this._getRouteFromKeyword(keyword);
    return {
      label: keyword.values[0],
      schemaLabel,
      more: keyword.values.slice(1),
      group: 'Docs',
      route,
      action: async () => {
        await routeTo(route);
      },
    };
  }

  _getRouteFromKeyword(keyword: Keyword): string {
    const { parent, parentSchemaName, schemaName } = keyword.meta;
    if (parent && parentSchemaName) {
      return getFormRoute(parentSchemaName as string, parent as string);
    }

    return getFormRoute(schemaName as string, keyword.values[0]);
  }

  _getGroupedKeywords() {
    /**
     * filter out the ignored groups
     * group by the keyword priority
     */
    const keywords: Keyword[] = [];
    for (const sn of Object.keys(this.keywords)) {
      if (this._isSearchable(this.searchables[sn])) {
        keywords.push(...this.keywords[sn]);
      }
    }

    return groupBy(keywords, 'priority');
  }

  _setSearchables() {
    for (const searchable of getSearchables()) {
      this.searchables[searchable.schemaName] ??= searchable;
    }
  }

  _setKeywords(maps: DocValues[], searchable: Searchable) {
    if (!maps?.length) {
      return;
    }

    this.keywords[searchable.schemaName] = [];

    for (const map of maps) {
      const keyword: Keyword = { values: [], meta: {}, priority: 0 };
      this._setKeywordValues(map, searchable, keyword);
      this._setMeta(map, searchable, keyword);
      this.keywords[searchable.schemaName]!.push(keyword);
    }

    this._setPriority(searchable);
  }

  _setKeywordValues(map: DocValues, searchable: Searchable, keyword: Keyword) {
    // Set individual field values
    for (const fn of searchable.fields) {
      let value = map[fn] as string | undefined;
      const field = getField(searchable.schemaName, fn);

      const { options } = field as OptionField;
      if (options) {
        value = options.find((o) => o.value === value)?.label ?? value;
      }

      keyword.values.push(value ?? '');
    }
  }

  _setMeta(map: DocValues, searchable: Searchable, keyword: Keyword) {
    keyword.meta.schemaName = searchable.schemaName;
    if (searchable.isSubmittable) {
      keyword.meta.docstatus = Number(map.docstatus);
    }

    if (searchable.isChild && map.parent) {
      keyword.meta.parent = String(map.parent);
      keyword.meta.parentSchemaName = toSchemaName(String(map.parenttype));
      keyword.values.unshift(keyword.meta.parent);
    }
  }

  _setPriority(searchable: Searchable) {
    const keywords = this.keywords[searchable.schemaName] ?? [];
    const basePriority = this.priorityMap[searchable.schemaName] ?? 0;

    for (const k of keywords) {
      k.priority += basePriority;

      // Submitted and cancelled documents.
      if (k.meta.docstatus) {
        k.priority += 25;
      }

      if (k.meta.docstatus === 2) {
        k.priority -= 200;
      }

      if (searchable.isChild) {
        k.priority -= 150;
      }
    }
  }
}

function isSearchItem(item: SearchItem | Keyword): item is SearchItem {
  return !!(item as SearchItem).group;
}
