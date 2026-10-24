import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import getCommonExportActions from 'reports/commonExporter';
import { PhoneLayout } from 'reports/types';
import { Field } from 'schemas/types';
import { StockLedger } from './StockLedger';
import { SerialNumberStatus } from './types';

export class StockBalance extends StockLedger {
  static title = t`Stock Balance`;
  static reportName = 'stock-balance';
  static serverReportName = 'Books Stock Balance';
  static phoneLayout: PhoneLayout = {
    type: 'tree',
    label: 'warehouse',
    groupBy: 'item_code',
    describeGroup: (count) =>
      count === 1 ? t`1 warehouse` : t`${count} warehouses`,
    icon: 'lucide-map-pin',
    values: [
      { fieldname: 'balance_quantity', label: t`Qty`, width: 52 },
      { fieldname: 'balance_value', label: t`Value`, width: 112 },
    ],
    chips: ['toDate', 'warehouse', 'itemCode'],
  };
  static isInventory = true;

  override ascending = true;
  override voucherType = 'All';
  override voucherNo = '';

  showSerialNumbers = false;
  serialNumberFilter: SerialNumberStatus = 'All';

  override colouredColumns: Record<string, 'red' | 'green' | null> = {
    incoming_quantity: 'green',
    outgoing_quantity: 'red',
    balance_quantity: null,
  };

  getFilters(): Field[] {
    const filters = [
      {
        fieldtype: 'Link',
        target: 'Item',
        placeholder: t`Item`,
        label: t`Item`,
        fieldname: 'itemCode',
      },
      {
        fieldtype: 'Link',
        target: 'Warehouse',
        placeholder: t`Warehouse`,
        label: t`Warehouse`,
        fieldname: 'warehouse',
      },
      ...(this.hasBatches
        ? [
            {
              fieldtype: 'Link',
              target: 'Batch',
              placeholder: t`Batch`,
              label: t`Batch`,
              fieldname: 'batchNo',
            },
          ]
        : []),
      {
        fieldtype: 'Date',
        placeholder: t`From Date`,
        label: t`From Date`,
        fieldname: 'fromDate',
      },
      {
        fieldtype: 'Date',
        placeholder: t`To Date`,
        label: t`To Date`,
        fieldname: 'toDate',
      },
      ...(this.hasSerialNumbers
        ? [
            {
              fieldtype: 'Check',
              placeholder: t`Serial Number`,
              label: t`Serial Number`,
              fieldname: 'showSerialNumbers',
            },
          ]
        : []),
      ...(this.hasSerialNumbers && this.showSerialNumbers
        ? ([
            {
              fieldtype: 'Select',
              options: [
                { label: t`All`, value: 'All' },
                { label: t`In stock`, value: 'In stock' },
                { label: t`Out stock`, value: 'Out stock' },
              ],
              placeholder: t`Serial Number Status`,
              label: t`Serial Number Status`,
              fieldname: 'serialNumberFilter',
              default: 'All',
            },
          ] as Field[])
        : []),
    ] as Field[];

    return filters;
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }
}
