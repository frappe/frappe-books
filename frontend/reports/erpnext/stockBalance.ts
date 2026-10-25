import { t } from 'fyo';
import { DEFAULT } from './defaults';
import type { ERPNextReportDefinition } from './types';

export const stockBalance: ERPNextReportDefinition = {
  reportName: 'Stock Balance',
  title: t`Stock Balance`,
  source: 'erpnext/public/js/stock_balance_report.js',
  filters: [
    {
      fieldname: 'company',
      label: t`Company`,
      fieldtype: 'Link',
      options: 'Company',
      default: DEFAULT.company,
    },
    {
      fieldname: 'from_date',
      label: t`From Date`,
      fieldtype: 'Date',
      reqd: 1,
      default: DEFAULT.monthAgo,
    },
    {
      fieldname: 'to_date',
      label: t`To Date`,
      fieldtype: 'Date',
      reqd: 1,
      default: DEFAULT.today,
    },
    {
      fieldname: 'item_group',
      label: t`Item Group`,
      fieldtype: 'Link',
      options: 'Item Group',
    },
    {
      fieldname: 'item_code',
      label: t`Items`,
      fieldtype: 'MultiSelectList',
      options: 'Item',
      linkFilters: ({ item_group }) => ({
        ...(item_group ? { item_group } : {}),
        is_stock_item: 1,
      }),
    },
    {
      fieldname: 'warehouse',
      label: t`Warehouses`,
      fieldtype: 'MultiSelectList',
      options: 'Warehouse',
      linkFilters: ({ company }) => (company ? { company } : {}),
    },
    {
      fieldname: 'include_zero_stock_items',
      label: t`Include Zero Stock Items`,
      fieldtype: 'Check',
      default: 1,
    },
    {
      fieldname: 'valuation_field_type',
      label: t`Valuation Field Type`,
      fieldtype: 'Select',
      options: 'Currency\nFloat',
      default: 'Currency',
      hidden: 1,
    },
  ],
  isInventory: true,
  phoneLayout: {
    type: 'tree',
    label: 'warehouse',
    groupBy: 'item_code',
    describeGroup: (count) =>
      count === 1 ? t`1 warehouse` : t`${count} warehouses`,
    icon: 'lucide-map-pin',
    values: [
      { fieldname: 'bal_qty', label: t`Qty`, width: 52 },
      { fieldname: 'bal_val', label: t`Value`, width: 112 },
    ],
    chips: ['warehouse', 'item_code'],
  },
};
