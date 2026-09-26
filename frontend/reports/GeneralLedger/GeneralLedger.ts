import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ColumnField, LedgerRow, ReportRow } from 'reports/types';
import { Field } from 'schemas/types';

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
  usePagination = true;
  loading = false;

  ascending = false;
  reverted = false;
  referenceType: ReferenceType = 'All';
  groupBy: 'none' | 'party' | 'account' | 'referenceName' = 'none';

  setDefaultFilters() {
    if (!this.toDate) {
      this.toDate = DateTime.now().plus({ days: 1 }).toISODate();
      this.fromDate = DateTime.now().minus({ years: 1 }).toISODate();
    }
  }

  async setReportData() {
    this.loading = true;
    const rows = await this.fyo.db.getReportData<LedgerRow[]>(
      'getGeneralLedger',
      this.filterMap
    );
    this.reportData = rows.map((row) => this._getReportRow(row));
    this.loading = false;
  }

  _getReportRow(row: LedgerRow): ReportRow {
    if (row.type === 'blank') {
      return {
        isEmpty: true,
        cells: this.columns.map((c) => ({
          rawValue: '',
          value: '',
          width: c.width ?? 1,
        })),
      };
    }

    const values = { ...row, account: this._getAccountLabel(row) };
    return {
      cells: this.columns.map((column) => ({
        italics: row.type === 'opening' || row.type === 'total',
        bold: row.type === 'closing',
        value: this._formatCell(column, values),
        rawValue: values[column.fieldname as keyof LedgerRow],
        align: column.align ?? 'left',
        width: column.width ?? 1,
      })),
    };
  }

  _getAccountLabel(row: LedgerRow) {
    if (row.type === 'opening') {
      return row.account ? t`Opening: ${row.account}` : t`Opening`;
    }

    if (row.type === 'total') {
      return t`Total`;
    }

    if (row.type === 'closing') {
      return t`Closing`;
    }

    return row.account;
  }

  _formatCell(column: ColumnField, row: LedgerRow): string {
    const value = row[column.fieldname as keyof LedgerRow];
    if (value === null || value === undefined) {
      return '';
    }

    if (column.fieldname === 'reverted') {
      return value ? t`Reverted` : '';
    }

    if (column.fieldname === 'referenceType') {
      return this.fyo.schemaMap[value as string]?.label ?? String(value);
    }

    if (column.fieldname === 'index') {
      return String(value);
    }

    return this.fyo.format(value, column.fieldtype);
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
          { label: t`Reference`, value: 'referenceName' },
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

  getColumns(): ColumnField[] {
    let columns = [
      {
        label: '#',
        fieldtype: 'Int',
        fieldname: 'index',
        align: 'right',
        width: 0.5,
      },
      {
        label: t`Account`,
        fieldtype: 'Link',
        fieldname: 'account',
        width: 1.5,
      },
      {
        label: t`Date`,
        fieldtype: 'Date',
        fieldname: 'date',
      },
      {
        label: t`Debit`,
        fieldtype: 'Currency',
        fieldname: 'debit',
        align: 'right',
        width: 1.25,
      },
      {
        label: t`Credit`,
        fieldtype: 'Currency',
        fieldname: 'credit',
        align: 'right',
        width: 1.25,
      },
      {
        label: t`Balance`,
        fieldtype: 'Currency',
        fieldname: 'balance',
        align: 'right',
        width: 1.25,
      },
      {
        label: t`Party`,
        fieldtype: 'Link',
        fieldname: 'party',
      },
      {
        label: t`Ref Name`,
        fieldtype: 'Data',
        fieldname: 'referenceName',
      },
      {
        label: t`Ref Type`,
        fieldtype: 'Data',
        fieldname: 'referenceType',
      },
      {
        label: t`Reverted`,
        fieldtype: 'Check',
        fieldname: 'reverted',
      },
    ] as ColumnField[];

    if (!this.reverted) {
      columns = columns.filter((f) => f.fieldname !== 'reverted');
    }

    return columns;
  }
}
