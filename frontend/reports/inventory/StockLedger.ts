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
    title: 'item',
    amount: 'quantity',
    meta: ['location', 'reference_name'],
    balance: 'balance_quantity',
    chips: ['fromDate', 'toDate', 'item', 'location'],
  };
  static isInventory = true;

  usePagination = true;

  item?: string;
  location?: string;
  batch?: string;
  serialNumber?: string;
  fromDate?: string;
  toDate?: string;
  ascending?: boolean;
  /** The doctype of the entries' documents, or `All`. */
  referenceType?: string = 'All';
  referenceName?: string;

  groupBy: 'none' | 'item' | 'location' | 'reference_name' = 'none';

  /** Columns coloured green or red; `null` colours by the sign of the value. */
  colouredColumns: Record<string, 'red' | 'green' | null> = {
    quantity: null,
    value_change: null,
  };

  get hasBatches(): boolean {
    return !!this.fyo.singles.InventorySettings?.enable_batches;
  }

  get hasSerialNumbers(): boolean {
    return !!this.fyo.singles.InventorySettings?.enable_serial_number;
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
          { label: t`Stock Movements`, value: 'Books Stock Movement' },
          { label: t`Shipment`, value: 'Books Shipment' },
          { label: t`Purchase Receipt`, value: 'Books Purchase Receipt' },
        ],
        label: t`Ref Type`,
        fieldname: 'referenceType',
        placeholder: t`Ref Type`,
      },
      {
        fieldtype: 'DynamicLink',
        label: t`Ref Name`,
        references: 'referenceType',
        placeholder: t`Ref Name`,
        emptyMessage: t`Change Ref Type`,
        fieldname: 'referenceName',
      },
      {
        fieldtype: 'Link',
        target: 'Item',
        placeholder: t`Item`,
        label: t`Item`,
        fieldname: 'item',
      },
      {
        fieldtype: 'Link',
        target: 'Location',
        placeholder: t`Location`,
        label: t`Location`,
        fieldname: 'location',
      },
      ...(this.hasBatches
        ? ([
            {
              fieldtype: 'Link',
              target: 'Batch',
              placeholder: t`Batch`,
              label: t`Batch`,
              fieldname: 'batch',
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
          { label: t`Item`, value: 'item' },
          { label: t`Location`, value: 'location' },
          { label: t`Reference`, value: 'reference_name' },
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
