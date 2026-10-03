import { Fyo, t } from 'fyo';
import { RawValueMap } from 'fyo/core/types';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports';
import { OptionField } from 'schemas/types';
import type { DocValues } from 'src/frappe/api';
import {
  getAllSchemaNames,
  getField,
  getSchema,
} from 'src/frappe/registry';
import {
  getSearchables,
  searchDocuments,
  type Searchable,
} from 'src/frappe/search';
import { getImportableSchemaNames } from 'src/importer';
import { createFilters, routeFilters } from 'src/utils/filters';
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


interface SearchFilters {
  groupFilters: Record<SearchGroup, boolean>;
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
   * The search palette's items: lists, actions, reports and pages that
   * fuzzy match the input here, then the documents the server's search
   * index finds for it, in the server's order.
   */

  _docRequestId = 0;
  recentKey = 'searchRecents';
  searchables: Record<string, Searchable>;
  docs: DocSearchItem[] = [];

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
    skipTransactions: false,
  };

  fyo: Fyo;

  _nonDocSearchList: SearchItem[];
  _groupLabelMap?: Record<SearchGroup, string>;

  maxRecentItems = 10;
  recentExpiryDays = 30;

  constructor(fyo: Fyo) {
    this.fyo = fyo;
    this.searchables = {};
    this._nonDocSearchList = getNonDocSearchList(fyo);
  }

  /**
   * these getters are used for hacky two way binding between the
   * `skipTransactions` filter and the `schemaFilters`.
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

  /** Schema filter chips: transactions first, by schema label. */
  get schemaFilterOptions(): { value: string; label: string }[] {
    return Object.values(this.searchables)
      .map(({ schemaName, isSubmittable }) => ({
        value: schemaName,
        label: getSchema(schemaName)?.label ?? schemaName,
        index: isSubmittable ? 0 : 1,
      }))
      .sort((a, b) => a.index - b.index);
  }

  isFilterOn(filterName: string): boolean {
    if (filterName in this.filters.groupFilters) {
      return this.filters.groupFilters[filterName as SearchGroup];
    }

    if (filterName === 'skipTransactions') {
      return this.filters.skipTransactions;
    }

    return !!this.filters.schemaFilters[filterName];
  }

  /** Filters that differ from the defaults; a skip filter counts once. */
  get changedFilterCount(): number {
    const { groupFilters, schemaFilters, skipTransactions } = this.filters;
    const groups = searchGroups.filter((group) => !groupFilters[group]);
    const schemas = Object.values(this.searchables).filter(
      ({ schemaName, isSubmittable }) =>
        !schemaFilters[schemaName] && !(isSubmittable && skipTransactions)
    );

    return groups.length + schemas.length + Number(skipTransactions);
  }

  resetFilters() {
    for (const group of searchGroups) {
      this.filters.groupFilters[group] = true;
    }

    this.filters.skipTransactions = false;
    this._setSchemaFilters();
  }

  set(filterName: string, value: boolean) {
    if (filterName in this.filters.groupFilters) {
      this.filters.groupFilters[filterName as SearchGroup] = value;
    } else if (filterName in this.searchables) {
      this.filters.schemaFilters[filterName] = value;
      this.filters.skipTransactions = this.skipTransactions;
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
    const doctypes = Object.values(this.searchables)
      .filter((searchable) => this._isSearchable(searchable))
      .map(({ doctype }) => doctype);
    const text = input?.trim();
    const rows =
      text && doctypes.length ? await searchDocuments(text, doctypes) : [];
    if (requestId !== this._docRequestId) {
      return false;
    }

    this.docs = rows.flatMap((row) => this._getDocSearchItem(row) ?? []);
    return true;
  }

  _isSearchable(searchable?: Searchable): boolean {
    if (
      !searchable ||
      !this.filters.groupFilters.Docs ||
      !this.filters.schemaFilters[searchable.schemaName]
    ) {
      return false;
    }

    return !(searchable.isSubmittable && this.filters.skipTransactions);
  }

  search(input?: string): SearchItems {
    const array: SearchItems = [];

    const showRecent =
      !input ||
      input.startsWith('#') ||
      input.toLowerCase().startsWith('recent');
    if (showRecent && this.filters.groupFilters.Recent) {
      const recentSearchTerm = input?.replace(/^#|recent/gi, '').trim();
      array.push(...this.getRecentItems(recentSearchTerm));
    }

    this._pushNonDocSearchItems(array, input);
    array.push(
      ...this.docs.filter((doc) =>
        this._isSearchable(this.searchables[doc.schemaName!])
      )
    );
    return array;
  }

  _pushNonDocSearchItems(array: SearchItems, input?: string) {
    const matches: { item: SearchItem; distance: number }[] = [];
    for (const item of this._nonDocSearchList) {
      const match = this.filters.groupFilters[item.group]
        ? this._getSubArrayItem(item, input)
        : null;
      if (match) {
        matches.push(match);
      }
    }

    matches.sort((a, b) => a.distance - b.distance);
    array.push(...matches.map(({ item }) => item));
  }

  _getSubArrayItem(item: SearchItem, input?: string) {
    if (!input) {
      return { item, distance: 0 };
    }

    const values = this._getValueListFromSearchItem(item).filter(Boolean);
    const { isMatch, distance } = this._getMatchAndDistance(input, values);
    return isMatch ? { item, distance } : null;
  }

  _getValueListFromSearchItem({ label, group }: SearchItem): string[] {
    return [label, group];
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

  /** A server row as the palette shows it: its name, then its search fields. */
  _getDocSearchItem(row: DocValues): DocSearchItem | undefined {
    const searchable = Object.values(this.searchables).find(
      ({ doctype }) => doctype === row.doctype
    );
    if (!searchable) {
      return;
    }

    const { schemaName } = searchable;

    const [label, ...more] = searchable.fields.map((fieldname) =>
      this._getDisplayValue(schemaName, fieldname, row[fieldname])
    );
    const route = getFormRoute(schemaName, String(row.name));
    return {
      label,
      schemaLabel: getSchema(schemaName)?.label ?? schemaName,
      schemaName,
      more,
      group: 'Docs',
      route,
      action: async () => {
        await routeTo(route);
      },
    };
  }

  /** A field's value, or its Select option's label. */
  _getDisplayValue(schemaName: string, fieldname: string, value: unknown) {
    const text = value == null ? '' : String(value);
    const { options } = (getField(schemaName, fieldname) ?? {}) as OptionField;
    return options?.find((option) => option.value === text)?.label ?? text;
  }

  _setSearchables() {
    for (const searchable of getSearchables()) {
      this.searchables[searchable.schemaName] ??= searchable;
    }
  }
}
