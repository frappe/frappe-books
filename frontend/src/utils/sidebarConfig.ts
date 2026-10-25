import { t } from 'fyo';
import { kebabCase } from 'lodash';
import { getReports, type ReportName } from 'reports';
import { erpnextReports } from 'reports/erpnext';
import { canOpenReport } from 'reports/serverReport';
import { getImportableSchemaNames } from 'src/importer';
import { canPickFields } from 'src/frappe/fieldPicks';
import { isAccessoryMode } from 'src/frappe/mode';
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

/** Pages that need a right, by their route's first part. */
const pageRights: Record<string, () => boolean> = {
  'chart-of-accounts': () => fyo.can('Account', 'read'),
  settings: canEditSettings,
};

/** Whether the user can read the list, open the report or use the page the route shows. */
export function canOpen(route: string): boolean {
  const [, page, name] = route.split('/');
  if (page === 'list') {
    return fyo.can(name, 'read');
  }

  if (page === 'report') {
    const report = getReports()[name as ReportName];
    return !!report && canOpenReport(report.serverReportName);
  }

  return pageRights[page]?.() ?? true;
}

/** Whether the user may change the settings, which the Setup group gathers. */
function canEditSettings(): boolean {
  return fyo.can('SystemSettings', 'write');
}

/** Standalone customizes forms with Books Custom Forms; accessory mode picks the ERPNext fields they show. */
function getCustomizeFormItem(): SidebarItem {
  if (isAccessoryMode()) {
    return {
      label: t`Customize Form`,
      name: 'customize-form',
      icon: 'lucide-layout-template',
      route: '/customize-form',
      hidden: () => !canPickFields(),
    };
  }

  return {
    label: t`Customize Form`,
    name: 'customize-form',
    icon: 'lucide-layout-template',
    route: `/list/CustomForm/${t`Customize Form`}`,
    hidden: () =>
      !fyo.isFeatureOn('enable_form_customization') ||
      !fyo.can('CustomForm', 'create'),
  };
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
          icon: 'lucide-file-up',
          route: '/report/GSTR1',
        },
        {
          label: t`GSTR2`,
          name: 'gstr2',
          icon: 'lucide-file-down',
          route: '/report/GSTR2',
        },
      ],
    },
  ];
}

/** Stock records, with inventory on; delivery notes and purchase receipts sit with sales and purchases. */
function getInventorySidebar(): SidebarRoot {
  return {
    label: t`Inventory`,
    name: 'inventory',
    icon: 'lucide-package',
    route: '/list/StockEntry',
    hidden: isInventoryOff,
    items: [
      {
        label: t`Stock Entry`,
        name: 'stock-entry',
        icon: 'lucide-arrow-right-left',
        route: '/list/StockEntry',
        schemaName: 'StockEntry',
      },
      {
        label: t`Warehouse`,
        name: 'warehouse',
        icon: 'lucide-warehouse',
        route: '/list/Warehouse',
        schemaName: 'Warehouse',
      },
      {
        label: t`Batch`,
        name: 'batch',
        icon: 'lucide-boxes',
        route: '/list/Batch',
        schemaName: 'Batch',
        hidden: () => !fyo.isFeatureOn('enable_batches'),
      },
      {
        label: t`Serial No`,
        name: 'serial-no',
        icon: 'lucide-scan-barcode',
        route: '/list/SerialNo',
        schemaName: 'SerialNo',
        hidden: () => !fyo.isFeatureOn('enable_serial_number'),
      },
    ],
  };
}

/** The POS screen, its profiles and its shifts. */
function getPOSSidebar(): SidebarRoot {
  return {
    label: t`POS`,
    name: 'pos',
    route: '/pos',
    icon: 'lucide-store',
    hidden: () => !fyo.isFeatureOn('enable_point_of_sale'),
    items: [
      {
        label: t`Point of Sale`,
        name: 'point-of-sale',
        icon: 'lucide-monitor-smartphone',
        route: '/pos',
        hidden: () => !fyo.can('POSOpeningEntry', 'create'),
      },
      {
        label: t`POS Profile`,
        name: 'pos-profile',
        icon: 'lucide-id-card',
        route: '/list/POSProfile',
        schemaName: 'POSProfile',
      },
      {
        label: t`POS Opening Entry`,
        name: 'pos-opening-entry',
        icon: 'lucide-door-open',
        route: '/list/POSOpeningEntry',
        schemaName: 'POSOpeningEntry',
      },
      {
        label: t`POS Closing Entry`,
        name: 'pos-closing-entry',
        icon: 'lucide-door-closed',
        route: '/list/POSClosingEntry',
        schemaName: 'POSClosingEntry',
      },
    ],
  };
}

function getReportSidebar() {
  return {
    label: t`Reports`,
    name: 'reports',
    icon: 'lucide-chart-no-axes-combined',
    route: '/report/GeneralLedger',
    items: isAccessoryMode() ? getERPNextReportItems() : getBooksReportItems(),
  };
}

// Each report's icon, by route name, in both modes
const REPORT_ICONS: Record<string, string> = {
  GeneralLedger: 'lucide-chart-column',
  TrialBalance: 'lucide-scale',
  ProfitAndLoss: 'lucide-activity',
  BalanceSheet: 'lucide-chart-pie',
  StockBalance: 'lucide-boxes',
  StockLedger: 'lucide-list',
  AccountsReceivable: 'lucide-arrow-down-left',
  AccountsPayable: 'lucide-arrow-up-right',
};

/** Accessory mode lists ERPNext's reports, stock ones only with inventory on. */
function getERPNextReportItems(): SidebarItem[] {
  return Object.entries(erpnextReports).map(([name, report]) => ({
    label: report.title,
    name: kebabCase(name),
    icon: REPORT_ICONS[name],
    route: `/report/${name}`,
    hidden: () => report.isInventory && isInventoryOff(),
  }));
}

function isInventoryOff(): boolean {
  return !fyo.isFeatureOn('enable_inventory');
}

function getBooksReportItems(): SidebarItem[] {
  return [
    {
      label: t`General Ledger`,
      name: 'general-ledger',
      icon: REPORT_ICONS.GeneralLedger,
      route: '/report/GeneralLedger',
    },
    {
      label: t`Profit and Loss`,
      name: 'profit-and-loss',
      icon: REPORT_ICONS.ProfitAndLoss,
      route: '/report/ProfitAndLoss',
    },
    {
      label: t`Balance Sheet`,
      name: 'balance-sheet',
      icon: REPORT_ICONS.BalanceSheet,
      route: '/report/BalanceSheet',
    },
    {
      label: t`Trial Balance`,
      name: 'trial-balance',
      icon: REPORT_ICONS.TrialBalance,
      route: '/report/TrialBalance',
    },
    {
      label: t`Stock Ledger`,
      name: 'stock-ledger',
      icon: REPORT_ICONS.StockLedger,
      route: '/report/StockLedger',
      hidden: isInventoryOff,
    },
    {
      label: t`Stock Balance`,
      name: 'stock-balance',
      icon: REPORT_ICONS.StockBalance,
      route: '/report/StockBalance',
      hidden: isInventoryOff,
    },
  ];
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
          label: t`Quotation`,
          name: 'quotation',
          icon: 'lucide-file-text',
          route: '/list/Quotation',
          schemaName: 'Quotation',
        },
        {
          label: t`Sales Invoice`,
          name: 'sales-invoices',
          icon: 'lucide-receipt',
          route: '/list/SalesInvoice',
          schemaName: 'SalesInvoice',
        },
        {
          label: t`Delivery Note`,
          name: 'delivery-note',
          icon: 'lucide-truck',
          route: '/list/DeliveryNote',
          schemaName: 'DeliveryNote',
          hidden: isInventoryOff,
        },
        {
          label: t`Sales Payment`,
          name: 'payments',
          icon: 'lucide-wallet',
          route: `/list/PaymentEntry/${t`Sales Payment`}`,
          schemaName: 'PaymentEntry',
          filters: routeFilters.SalesPayments,
        },
        {
          label: t`Customer`,
          name: 'customer',
          icon: 'lucide-circle-user',
          route: '/list/Customer',
          schemaName: 'Customer',
        },
        {
          label: t`Loyalty Program`,
          name: 'loyalty-program',
          icon: 'lucide-gift',
          route: '/list/LoyaltyProgram',
          schemaName: 'LoyaltyProgram',
          hidden: () => !fyo.isFeatureOn('enable_loyalty_point_program'),
        },
        {
          label: t`Lead`,
          name: 'lead',
          icon: 'lucide-user-plus',
          route: '/list/Lead',
          schemaName: 'Lead',
          hidden: () => !fyo.isFeatureOn('enable_lead'),
        },
        {
          label: t`Pricing Rule`,
          name: 'pricing-rule',
          icon: 'lucide-tag',
          route: '/list/PricingRule',
          schemaName: 'PricingRule',
          hidden: () => !fyo.isFeatureOn('enable_pricing_rule'),
        },
        {
          label: t`Coupon Code`,
          name: 'coupon-code',
          icon: 'lucide-ticket',
          route: `/list/CouponCode`,
          schemaName: 'CouponCode',
          hidden: () => !fyo.isFeatureOn('enable_coupon_code'),
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
          label: t`Purchase Invoice`,
          name: 'purchase-invoices',
          icon: 'lucide-receipt',
          route: '/list/PurchaseInvoice',
          schemaName: 'PurchaseInvoice',
        },
        {
          label: t`Purchase Receipt`,
          name: 'purchase-receipt',
          icon: 'lucide-package-check',
          route: '/list/PurchaseReceipt',
          schemaName: 'PurchaseReceipt',
          hidden: isInventoryOff,
        },
        {
          label: t`Purchase Payment`,
          name: 'payments',
          icon: 'lucide-wallet',
          route: `/list/PaymentEntry/${t`Purchase Payment`}`,
          schemaName: 'PaymentEntry',
          filters: routeFilters.PurchasePayments,
        },
        {
          label: t`Supplier`,
          name: 'supplier',
          icon: 'lucide-building-2',
          route: '/list/Supplier',
          schemaName: 'Supplier',
        },
      ] as SidebarItem[],
    },
    getInventorySidebar(),
    {
      label: t`Common`,
      name: 'common-entries',
      icon: 'lucide-notebook-tabs',
      route: '/list/JournalEntry',
      items: [
        {
          label: t`Journal Entry`,
          name: 'journal-entry',
          icon: 'lucide-book-open',
          route: '/list/JournalEntry',
          schemaName: 'JournalEntry',
        },
        {
          label: t`Item`,
          name: 'item',
          icon: 'lucide-package',
          route: '/list/Item',
          schemaName: 'Item',
        },
        {
          label: t`Item Group`,
          name: 'item-group',
          icon: 'lucide-folder-tree',
          route: '/list/ItemGroup',
          schemaName: 'ItemGroup',
          hidden: () => !fyo.isFeatureOn('enable_item_group'),
        },
        {
          label: t`UOM`,
          name: 'uom',
          icon: 'lucide-ruler',
          route: '/list/UOM',
          schemaName: 'UOM',
        },
        {
          label: t`Price List`,
          name: 'price-list',
          icon: 'lucide-list',
          route: '/list/PriceList',
          schemaName: 'PriceList',
          hidden: () => !fyo.isFeatureOn('enable_price_list'),
        },
        {
          label: t`Item Price`,
          name: 'item-price',
          icon: 'lucide-tags',
          route: '/list/ItemPrice',
          schemaName: 'ItemPrice',
          hidden: () => !fyo.isFeatureOn('enable_price_list'),
        },
      ] as SidebarItem[],
    },
    getReportSidebar(),
    getPOSSidebar(),
    getRegionalSidebar(),
    {
      label: t`Setup`,
      name: 'setup',
      icon: 'lucide-sliders-horizontal',
      route: '/chart-of-accounts',
      // Accessory mode shows each Setup page the user's ERPNext roles open.
      hidden: () => !isAccessoryMode() && !canEditSettings(),
      items: [
        {
          label: t`Chart of Accounts`,
          name: 'chart-of-accounts',
          icon: 'lucide-list-tree',
          route: '/chart-of-accounts',
        },
        {
          label: t`Mode of Payment`,
          name: 'mode-of-payment',
          icon: 'lucide-banknote',
          route: '/list/ModeOfPayment',
          schemaName: 'ModeOfPayment',
        },
        {
          label: t`Tax Template`,
          name: 'taxes',
          icon: 'lucide-percent',
          route: '/list/ItemTaxTemplate',
          schemaName: 'ItemTaxTemplate',
        },
        {
          label: t`Sales Taxes and Charges Template`,
          name: 'sales-taxes',
          icon: 'lucide-receipt-text',
          route: '/list/SalesTaxesAndChargesTemplate',
          schemaName: 'SalesTaxesAndChargesTemplate',
        },
        {
          label: t`Purchase Taxes and Charges Template`,
          name: 'purchase-taxes',
          icon: 'lucide-receipt-text',
          route: '/list/PurchaseTaxesAndChargesTemplate',
          schemaName: 'PurchaseTaxesAndChargesTemplate',
        },
        {
          label: t`Number Series`,
          name: 'number-series',
          icon: 'lucide-hash',
          route: '/list/NumberSeries',
          schemaName: 'NumberSeries',
        },
        {
          label: t`Import Wizard`,
          name: 'import-wizard',
          icon: 'lucide-upload',
          route: '/import-wizard',
          hidden: () => !getImportableSchemaNames(fyo).length,
        },
        {
          label: t`Print Template`,
          name: 'print-template',
          icon: 'lucide-printer',
          route: `/list/PrintFormat/${t`Print Template`}`,
          // The template builder makes Books templates; ERPNext has its print formats.
          hidden: isAccessoryMode,
        },
        getCustomizeFormItem(),
        {
          label: t`Settings`,
          name: 'settings',
          icon: 'lucide-settings',
          route: '/settings',
        },
      ] as SidebarItem[],
    },
  ].flat();
}
