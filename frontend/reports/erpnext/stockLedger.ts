import { t } from 'fyo';
import { DEFAULT } from './defaults';
import type { ERPNextReportDefinition } from './types';

export const stockLedger: ERPNextReportDefinition = {
  reportName: 'Stock Ledger',
  title: t`Stock Ledger`,
  source: 'erpnext/stock/report/stock_ledger/stock_ledger.js',
  filters: [
    {
      fieldname: 'company',
      label: t`Company`,
      fieldtype: 'Link',
      options: 'Company',
      default: DEFAULT.company,
      reqd: 1,
    },
    {
      fieldname: 'from_date',
      label: t`From Date`,
      fieldtype: 'Date',
      default: DEFAULT.monthAgo,
      reqd: 1,
    },
    {
      fieldname: 'to_date',
      label: t`To Date`,
      fieldtype: 'Date',
      default: DEFAULT.today,
      reqd: 1,
    },
    {
      fieldname: 'warehouse',
      label: t`Warehouses`,
      fieldtype: 'MultiSelectList',
      options: 'Warehouse',
      linkFilters: ({ company }) => ({ company }),
    },
    {
      fieldname: 'item_code',
      label: t`Items`,
      fieldtype: 'MultiSelectList',
      options: 'Item',
    },
    {
      fieldname: 'item_group',
      label: t`Item Group`,
      fieldtype: 'Link',
      options: 'Item Group',
    },
    {
      fieldname: 'batch_no',
      label: t`Batch No`,
      fieldtype: 'Link',
      options: 'Batch',
    },
    { fieldname: 'voucher_no', label: t`Voucher #`, fieldtype: 'Data' },
    {
      fieldname: 'valuation_field_type',
      label: t`Valuation Field Type`,
      fieldtype: 'Select',
      options: 'Currency\nFloat',
      default: 'Currency',
      hidden: 1,
    },
    {
      fieldname: 'segregate_serial_batch_bundle',
      label: t`Enable Serial / Batch Bundle`,
      fieldtype: 'Check',
      default: 0,
      hidden: 1,
    },
  ],
  isInventory: true,
  /** ERPNext's batch_no on_change: a batch splits serial and batch bundles into their numbers. */
  onChange: {
    batch_no: ({ batch_no }) => ({
      segregate_serial_batch_bundle: batch_no ? 1 : 0,
    }),
  },
  phoneLayout: {
    type: 'entries',
    date: 'date',
    title: 'item_code',
    amount: ['in_qty', 'out_qty'],
    meta: ['warehouse', 'voucher_no'],
    balance: 'qty_after_transaction',
    chips: ['item_code', 'warehouse'],
  },
};
