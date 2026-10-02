import { t } from 'fyo';
import { reports } from 'reports';
import { canOpenReport } from 'reports/serverReport';
import { getImportableSchemaNames } from 'src/importer';
import { routeFilters } from 'src/utils/filters';
import { fyo } from '../initFyo';
import { SidebarConfig, SidebarItem, SidebarRoot } from './types';

export function getSidebarConfig(): SidebarConfig {
  const sideBar = getCompleteSidebar();
  return getFilteredSidebar(sideBar);
}

/** Leaves out what is turned off or the user cannot read, and groups left empty. */
function getFilteredSidebar(sideBar: SidebarConfig): SidebarConfig {
  return sideBar.filter((root) => {
    if (!root.items) {
      return isVisible(root);
    }

    root.items = root.items.filter(isVisible);
    if (!root.items.length || root.hidden?.()) {
      return false;
    }

    // A group opens one of the items it shows.
    if (!root.items.some(({ route }) => route === root.route)) {
      root.route = root.items[0].route;
    }

    return true;
  });
}

function isVisible(item: SidebarItem | SidebarRoot): boolean {
  return !item.hidden?.() && canOpen(item.route);
}

/** Whether the user can read the list or open the report the route shows. */
export function canOpen(route: string): boolean {
  const [, page, name] = route.split('/');
  if (page === 'list') {
    return fyo.can(name, 'read');
  }

  if (page === 'report') {
    const report = reports[name as keyof typeof reports];
    return canOpenReport(report.serverReportName);
  }

  return true;
}

function getRegionalSidebar(): SidebarRoot[] {
  const hasGstin = !!fyo.singles?.AccountingSettings?.gstin;
  if (!hasGstin) {
    return [];
  }

  return [
    {
      label: t`GST`,
      name: 'gst',
      icon: 'lucide-badge-indian-rupee',
      route: '/report/GSTR1',
      items: [
        {
          label: t`GSTR1`,
          name: 'gstr1',
          route: '/report/GSTR1',
        },
        {
          label: t`GSTR2`,
          name: 'gstr2',
          route: '/report/GSTR2',
        },
      ],
    },
  ];
}

function getInventorySidebar(): SidebarRoot[] {
  const hasInventory = !!fyo.singles.AccountingSettings?.enable_inventory;
  if (!hasInventory) {
    return [];
  }

  return [
    {
      label: t`Inventory`,
      name: 'inventory',
      icon: 'lucide-package',
      route: '/list/StockMovement',
      items: [
        {
          label: t`Stock Movement`,
          name: 'stock-movement',
          route: '/list/StockMovement',
          schemaName: 'StockMovement',
        },
        {
          label: t`Shipment`,
          name: 'shipment',
          route: '/list/Shipment',
          schemaName: 'Shipment',
        },
        {
          label: t`Purchase Receipt`,
          name: 'purchase-receipt',
          route: '/list/PurchaseReceipt',
          schemaName: 'PurchaseReceipt',
        },
      ],
    },
  ];
}

function getPOSSidebar() {
  return {
    label: t`POS`,
    name: 'pos',
    route: '/pos',
    icon: 'lucide-store',
    hidden: () => !fyo.singles.InventorySettings?.enable_point_of_sale,
  };
}

function getReportSidebar() {
  const isInventoryDisabled = () =>
    !fyo.singles.AccountingSettings?.enable_inventory;

  return {
    label: t`Reports`,
    name: 'reports',
    icon: 'lucide-chart-no-axes-combined',
    route: '/report/GeneralLedger',
    items: [
      {
        label: t`General Ledger`,
        name: 'general-ledger',
        route: '/report/GeneralLedger',
      },
      {
        label: t`Profit And Loss`,
        name: 'profit-and-loss',
        route: '/report/ProfitAndLoss',
      },
      {
        label: t`Balance Sheet`,
        name: 'balance-sheet',
        route: '/report/BalanceSheet',
      },
      {
        label: t`Trial Balance`,
        name: 'trial-balance',
        route: '/report/TrialBalance',
      },
      {
        label: t`Stock Ledger`,
        name: 'stock-ledger',
        route: '/report/StockLedger',
        hidden: isInventoryDisabled,
      },
      {
        label: t`Stock Balance`,
        name: 'stock-balance',
        route: '/report/StockBalance',
        hidden: isInventoryDisabled,
      },
    ],
  };
}

function getCompleteSidebar(): SidebarConfig {
  return [
    {
      label: t`Get Started`,
      name: 'get-started',
      route: '/get-started',
      icon: 'lucide-wrench',
      hidden: () =>
        !!fyo.singles.SystemSettings?.hide_get_started ||
        !fyo.can('GetStarted', 'write'),
    },
    {
      label: t`Dashboard`,
      name: 'dashboard',
      route: '/',
      icon: 'lucide-layout-dashboard',
    },
    {
      label: t`Sales`,
      name: 'sales',
      icon: 'lucide-credit-card',
      route: '/list/SalesInvoice',
      items: [
        {
          label: t`Sales Quotes`,
          name: 'sales-quotes',
          route: '/list/SalesQuote',
          schemaName: 'SalesQuote',
        },
        {
          label: t`Sales Invoices`,
          name: 'sales-invoices',
          route: '/list/SalesInvoice',
          schemaName: 'SalesInvoice',
        },
        {
          label: t`Sales Payments`,
          name: 'payments',
          route: `/list/Payment/${t`Sales Payments`}`,
          schemaName: 'Payment',
          filters: routeFilters.SalesPayments,
        },
        {
          label: t`Customers`,
          name: 'customers',
          route: `/list/Party/${t`Customers`}`,
          schemaName: 'Party',
          filters: routeFilters.Customers,
        },
        {
          label: t`Sales Items`,
          name: 'sales-items',
          route: `/list/Item/${t`Sales Items`}`,
          schemaName: 'Item',
          filters: routeFilters.SalesItems,
        },
        {
          label: t`Loyalty Program`,
          name: 'loyalty-program',
          route: '/list/LoyaltyProgram',
          schemaName: 'LoyaltyProgram',
          hidden: () => !fyo.singles.AccountingSettings?.enable_loyalty_program,
        },
        {
          label: t`Lead`,
          name: 'lead',
          route: '/list/Lead',
          schemaName: 'Lead',
          hidden: () => !fyo.singles.AccountingSettings?.enable_lead,
        },
        {
          label: t`Pricing Rule`,
          name: 'pricing-rule',
          route: '/list/PricingRule',
          schemaName: 'PricingRule',
          hidden: () => !fyo.singles.AccountingSettings?.enable_pricing_rule,
        },
        {
          label: t`Coupon Code`,
          name: 'coupon-code',
          route: `/list/CouponCode`,
          schemaName: 'CouponCode',
          hidden: () => !fyo.singles.AccountingSettings?.enable_coupon_code,
        },
      ] as SidebarItem[],
    },
    {
      label: t`Purchases`,
      name: 'purchases',
      icon: 'lucide-shopping-bag',
      route: '/list/PurchaseInvoice',
      items: [
        {
          label: t`Purchase Invoices`,
          name: 'purchase-invoices',
          route: '/list/PurchaseInvoice',
          schemaName: 'PurchaseInvoice',
        },
        {
          label: t`Purchase Payments`,
          name: 'payments',
          route: `/list/Payment/${t`Purchase Payments`}`,
          schemaName: 'Payment',
          filters: routeFilters.PurchasePayments,
        },
        {
          label: t`Suppliers`,
          name: 'suppliers',
          route: `/list/Party/${t`Suppliers`}`,
          schemaName: 'Party',
          filters: routeFilters.Suppliers,
        },
        {
          label: t`Purchase Items`,
          name: 'purchase-items',
          route: `/list/Item/${t`Purchase Items`}`,
          schemaName: 'Item',
          filters: routeFilters.PurchaseItems,
        },
      ] as SidebarItem[],
    },
    {
      label: t`Common`,
      name: 'common-entries',
      icon: 'lucide-notebook-tabs',
      route: '/list/JournalEntry',
      items: [
        {
          label: t`Journal Entry`,
          name: 'journal-entry',
          route: '/list/JournalEntry',
          schemaName: 'JournalEntry',
        },
        {
          label: t`Party`,
          name: 'party',
          route: '/list/Party',
          schemaName: 'Party',
        },
        {
          label: t`Items`,
          name: 'common-items',
          route: `/list/Item/${t`Items`}`,
          schemaName: 'Item',
          filters: [['item_usage', '=', 'Both']],
        },
        {
          label: t`Price List`,
          name: 'price-list',
          route: '/list/PriceList',
          schemaName: 'PriceList',
          hidden: () => !fyo.singles.AccountingSettings?.enable_price_list,
        },
      ] as SidebarItem[],
    },
    getReportSidebar(),
    getInventorySidebar(),
    getPOSSidebar(),
    getRegionalSidebar(),
    {
      label: t`Setup`,
      name: 'setup',
      icon: 'lucide-sliders-horizontal',
      route: '/chart-of-accounts',
      items: [
        {
          label: t`Chart of Accounts`,
          name: 'chart-of-accounts',
          route: '/chart-of-accounts',
          hidden: () => !fyo.can('Account', 'read'),
        },
        {
          label: t`Tax Templates`,
          name: 'taxes',
          route: '/list/Tax',
          schemaName: 'Tax',
        },
        {
          label: t`Number Series`,
          name: 'number-series',
          route: '/list/NumberSeries',
          schemaName: 'NumberSeries',
        },
        {
          label: t`Import Wizard`,
          name: 'import-wizard',
          route: '/import-wizard',
          hidden: () => !getImportableSchemaNames(fyo).length,
        },
        {
          label: t`Print Templates`,
          name: 'print-template',
          route: `/list/PrintFormat/${t`Print Templates`}`,
        },
        {
          label: t`Customize Form`,
          name: 'customize-form',
          route: `/list/CustomForm/${t`Customize Form`}`,
          hidden: () =>
            !fyo.singles.AccountingSettings?.enable_form_customization ||
            !fyo.can('CustomForm', 'create'),
        },
        {
          label: t`Settings`,
          name: 'settings',
          route: '/settings',
        },
      ] as SidebarItem[],
    },
  ].flat();
}
