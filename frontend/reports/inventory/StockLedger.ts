import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ColumnField, PhoneLayout, ReportCell } from 'reports/types';
import { Field, RawValue } from 'schemas/types';

export class StockLedger extends Report {
  static title = t`Stock Ledger`;
  static reportName = 'stock-ledger';
  static serverReportName = 'Books Stock Ledger';
  static phoneLayout: PhoneLayout = {
    type: 'entries',
    date: 'date',
    title: 'item_code',
    amount: 'actual_qty',
    meta: ['warehouse', 'voucher_no'],
    balance: 'qty_after_transaction',
    chips: ['fromDate', 'toDate', 'itemCode', 'warehouse'],
  };
  static isInventory = true;

  usePagination = true;

  itemCode?: string;
  warehouse?: string;
  batchNo?: string;
  serialNumber?: string;
  fromDate?: string;
  toDate?: string;
  ascending?: boolean;
  /** The doctype of the entries' documents, or `All`. */
  voucherType?: string = 'All';
  voucherNo?: string;

  groupBy: 'none' | 'item_code' | 'warehouse' | 'voucher_no' = 'none';

  /** Columns coloured green or red; `null` colours by the sign of the value. */
  colouredColumns: Record<string, 'red' | 'green' | null> = {
    actual_qty: null,
    stock_value_difference: null,
  };

  get hasBatches(): boolean {
    return this.fyo.isFeatureOn('enable_batches');
  }

  get hasSerialNumbers(): boolean {
    return this.fyo.isFeatureOn('enable_serial_number');
  }

  async setDefaultFilters() {
    if (!this.toDate) {
      const { fromDate, toDate } = await this.getDefaultFilters();
      this.toDate = toDate as string;
      this.fromDate = fromDate as string;
    }
  }

  getCell(column: ColumnField, rawValue: RawValue | undefined): ReportCell {
    const cell = super.getCell(column, rawValue);
    if (!(column.fieldname in this.colouredColumns)) {
      return cell;
    }

    const colour = this.colouredColumns[column.fieldname];
    if (colour) {
      cell.color = colour;
    } else if (typeof rawValue === 'number' && rawValue !== 0) {
      cell.color = rawValue > 0 ? 'green' : 'red';
    }

    return cell;
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Select',
        options: [
          { label: t`All`, value: 'All' },
          { label: t`Stock Entry`, value: 'Books Stock Entry' },
          { label: t`Delivery Note`, value: 'Books Delivery Note' },
          { label: t`Purchase Receipt`, value: 'Books Purchase Receipt' },
        ],
        label: t`Ref Type`,
        fieldname: 'voucherType',
        placeholder: t`Ref Type`,
      },
      {
        fieldtype: 'DynamicLink',
        label: t`Ref Name`,
        references: 'voucherType',
        placeholder: t`Ref Name`,
        emptyMessage: t`Change Ref Type`,
        fieldname: 'voucherNo',
      },
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
        ? ([
            {
              fieldtype: 'Link',
              target: 'Batch',
              placeholder: t`Batch`,
              label: t`Batch`,
              fieldname: 'batchNo',
            },
          ] as Field[])
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
      {
        fieldtype: 'Select',
        label: t`Group By`,
        fieldname: 'groupBy',
        options: [
          { label: t`None`, value: 'none' },
          { label: t`Item`, value: 'item_code' },
          { label: t`Warehouse`, value: 'warehouse' },
          { label: t`Reference`, value: 'voucher_no' },
        ],
      },
      {
        fieldtype: 'Check',
        label: t`Ascending Order`,
        fieldname: 'ascending',
      },
    ] as Field[];
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }
}
