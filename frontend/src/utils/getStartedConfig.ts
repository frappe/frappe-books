import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { openSettings, routeTo } from './ui';
import { GetStartedConfigItem } from './types';

export function getGetStartedConfig(): GetStartedConfigItem[] {
  return [
    {
      label: t`Organisation`,
      items: [
        {
          key: 'General',
          label: t`General`,
          icon: 'lucide-wrench',
          description: t`Set up your company information, email, country and fiscal year`,
          fieldname: 'company_setup',
          action: () => openSettings(ModelNameEnum.AccountingSettings),
        },
        {
          key: 'Print',
          label: t`Print`,
          icon: 'lucide-receipt-text',
          description: t`Customize your invoices by adding a logo and address details`,
          fieldname: 'print_setup',
          action: () => openSettings(ModelNameEnum.PrintSettings),
        },
        {
          key: 'System',
          label: t`System`,
          icon: 'lucide-settings',
          description: t`Setup system defaults like date format and display precision`,
          fieldname: 'system_setup',
          action: () => openSettings(ModelNameEnum.SystemSettings),
        },
      ],
    },
    {
      label: t`Accounts`,
      items: [
        {
          key: 'Review Accounts',
          label: t`Review Accounts`,
          icon: 'lucide-clipboard-check',
          description: t`Review your chart of accounts, add any account or tax heads as needed`,
          action: () => routeTo('/chart-of-accounts'),
          fieldname: 'chart_of_accounts_reviewed',
          documentation: 'https://docs.frappe.io/books/chart-of-accounts',
        },
        {
          key: 'Opening Balances',
          label: t`Opening Balances`,
          icon: 'lucide-landmark',
          fieldname: 'opening_balance_checked',
          description: t`Set up your opening balances before performing any accounting entries`,
          documentation: 'https://docs.frappe.io/books/setup-opening-balances',
        },
        {
          key: 'Add Taxes',
          label: t`Add Taxes`,
          icon: 'lucide-percent',
          fieldname: 'taxes_added',
          description: t`Set up your tax templates for your sales or purchase transactions`,
          action: () => routeTo('/list/Tax'),
          documentation:
            'https://docs.frappe.io/books/create-initial-entries#add-taxes',
        },
      ],
    },
    {
      label: t`Sales`,
      items: [
        {
          key: 'Add Sales Items',
          label: t`Add Items`,
          icon: 'lucide-box',
          description: t`Add products or services that you sell to your customers`,
          action: () =>
            routeTo({
              path: `/list/Item/${t`Sales Items`}`,
              query: {
                filters: JSON.stringify({ item_usage: 'Sales' }),
              },
            }),
          fieldname: 'sales_item_created',
          documentation:
            'https://docs.frappe.io/books/create-initial-entries#add-sales-items',
        },
        {
          key: 'Add Customers',
          label: t`Add Customers`,
          icon: 'lucide-user-round',
          description: t`Add a few customers to create your first sales invoice`,
          action: () =>
            routeTo({
              path: `/list/Party/${t`Customers`}`,
              query: {
                filters: JSON.stringify({ role: 'Customer' }),
              },
            }),
          fieldname: 'customer_created',
          documentation:
            'https://docs.frappe.io/books/create-initial-entries#add-customers',
        },
        {
          key: 'Create Sales Invoice',
          label: t`Create Sales Invoice`,
          icon: 'lucide-receipt-text',
          description: t`Create your first sales invoice for the created customer`,
          action: () => routeTo('/list/SalesInvoice'),
          fieldname: 'invoice_created',
          documentation: 'https://docs.frappe.io/books/sales-invoices',
        },
      ],
    },
    {
      label: t`Purchase`,
      items: [
        {
          key: 'Add Purchase Items',
          label: t`Add Items`,
          icon: 'lucide-box',
          description: t`Add products or services that you buy from your suppliers`,
          action: () =>
            routeTo({
              path: `/list/Item/${t`Purchase Items`}`,
              query: {
                filters: JSON.stringify({ item_usage: 'Purchases' }),
              },
            }),
          fieldname: 'purchase_item_created',
        },
        {
          key: 'Add Suppliers',
          label: t`Add Suppliers`,
          icon: 'lucide-truck',
          description: t`Add a few suppliers to create your first purchase invoice`,
          action: () =>
            routeTo({
              path: `/list/Party/${t`Suppliers`}`,
              query: { filters: JSON.stringify({ role: 'Supplier' }) },
            }),
          fieldname: 'supplier_created',
        },
        {
          key: 'Create Purchase Invoice',
          label: t`Create Purchase Invoice`,
          icon: 'lucide-receipt-indian-rupee',
          description: t`Create your first purchase invoice from the created supplier`,
          action: () => routeTo('/list/PurchaseInvoice'),
          fieldname: 'bill_created',
          documentation:
            'https://docs.frappe.io/books/purchase-invoices#creating-purchase-invoices',
        },
      ],
    },
  ];
}
