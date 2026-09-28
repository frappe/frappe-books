import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ServerRow } from 'reports/serverReport';
import { ColumnField, PhoneLayout, ReportRow } from 'reports/types';
import { Field, RawValue } from 'schemas/types';

type ReferenceType =
  | ModelNameEnum.SalesInvoice
  | ModelNameEnum.PurchaseInvoice
  | ModelNameEnum.Payment
  | ModelNameEnum.JournalEntry
  | ModelNameEnum.Shipment
  | ModelNameEnum.PurchaseReceipt
  | 'All';

export class GeneralLedger extends Report {
  static title = t`General Ledger`;
  static reportName = 'general-ledger';
  static serverReportName = 'Books General Ledger';
  static phoneLayout: PhoneLayout = {
    type: 'entries',
    date: 'date',
    title: 'account',
    amount: 'debit',
    credit: 'credit',
    meta: ['reference_name', 'party'],
    balance: 'balance',
    chips: ['fromDate', 'toDate', 'account', 'party'],
  };
  usePagination = true;

  ascending = false;
  reverted = false;
  referenceType: ReferenceType = 'All';
  groupBy: 'none' | 'party' | 'account' | 'reference_name' = 'none';

  async setDefaultFilters() {
    if (!this.toDate) {
      const { fromDate, toDate } = await this.getDefaultFilters();
      this.toDate = toDate as string;
      this.fromDate = fromDate as string;
    }
  }

  getReportRow(row: ServerRow): ReportRow {
    const reportRow = super.getReportRow(row);
    for (const cell of reportRow.cells) {
      cell.italics = row.type === 'opening' || row.type === 'total';
      cell.bold = row.type === 'closing';
    }

    return reportRow;
  }

  formatValue(column: ColumnField, rawValue: RawValue | undefined): string {
    if (column.fieldname === 'reverted') {
      return rawValue ? t`Reverted` : '';
    }

    return super.formatValue(column, rawValue);
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  getFilters() {
    const refTypeOptions = [
      { label: t`All`, value: 'All' },
      { label: t`Sales Invoices`, value: 'SalesInvoice' },
      { label: t`Purchase Invoices`, value: 'PurchaseInvoice' },
      { label: t`Payments`, value: 'Payment' },
      { label: t`Journal Entries`, value: 'JournalEntry' },
    ];

    if (this.fyo.singles.AccountingSettings?.enableInventory) {
      refTypeOptions.push(
        { label: t`Shipment`, value: 'Shipment' },
        { label: t`Purchase Receipt`, value: 'PurchaseReceipt' }
      );
    }

    return [
      {
        fieldtype: 'Select',
        options: refTypeOptions,
        label: t`Ref Type`,
        fieldname: 'referenceType',
        placeholder: t`Ref Type`,
      },
      {
        fieldtype: 'DynamicLink',
        label: t`Ref. Name`,
        references: 'referenceType',
        placeholder: t`Ref Name`,
        emptyMessage: t`Change Ref Type`,
        fieldname: 'referenceName',
      },
      {
        fieldtype: 'Link',
        target: 'Account',
        placeholder: t`Account`,
        label: t`Account`,
        fieldname: 'account',
      },
      {
        fieldtype: 'Link',
        target: 'Party',
        label: t`Party`,
        placeholder: t`Party`,
        fieldname: 'party',
      },
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
          { label: t`Party`, value: 'party' },
          { label: t`Account`, value: 'account' },
          { label: t`Reference`, value: 'reference_name' },
        ],
      },
      {
        fieldtype: 'Check',
        label: t`Include Cancelled`,
        fieldname: 'reverted',
      },
      {
        fieldtype: 'Check',
        label: t`Ascending Order`,
        fieldname: 'ascending',
      },
    ] as Field[];
  }
}
