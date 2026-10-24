import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ServerRow } from 'reports/serverReport';
import { ColumnField, PhoneLayout, ReportRow } from 'reports/types';
import { Field, RawValue } from 'schemas/types';

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
    meta: ['voucher_no', 'party'],
    balance: 'balance',
    chips: ['fromDate', 'toDate', 'account', 'partyType', 'party'],
  };
  usePagination = true;

  ascending = false;
  isCancelled = false;
  /** The doctype of the entries' documents, or `All`. */
  voucherType = 'All';
  groupBy: 'none' | 'party' | 'account' | 'voucher_no' = 'none';

  async setDefaultFilters() {
    if (!this.toDate) {
      const { fromDate, toDate } = await this.getDefaultFilters();
      this.toDate = toDate as string;
      this.fromDate = fromDate as string;
    }
  }

  getReportRow(row: ServerRow): ReportRow {
    const reportRow = super.getReportRow(row);
    reportRow.isSummary = row.type !== 'entry';
    for (const cell of reportRow.cells) {
      cell.italics = row.type === 'opening' || row.type === 'total';
      cell.bold = row.type === 'closing';
    }

    return reportRow;
  }

  formatValue(column: ColumnField, rawValue: RawValue | undefined): string {
    if (column.fieldname === 'is_cancelled') {
      return rawValue ? t`Cancelled` : '';
    }

    return super.formatValue(column, rawValue);
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  getFilters() {
    const refTypeOptions = [
      { label: t`All`, value: 'All' },
      { label: t`Sales Invoice`, value: 'Books Sales Invoice' },
      { label: t`Purchase Invoice`, value: 'Books Purchase Invoice' },
      { label: t`Payment Entry`, value: 'Books Payment Entry' },
      { label: t`Journal Entry`, value: 'Books Journal Entry' },
    ];

    if (this.fyo.singles.AccountingSettings?.enable_inventory) {
      refTypeOptions.push(
        { label: t`Delivery Note`, value: 'Books Delivery Note' },
        { label: t`Purchase Receipt`, value: 'Books Purchase Receipt' },
        { label: t`Stock Entry`, value: 'Books Stock Entry' }
      );
    }

    return [
      {
        fieldtype: 'Select',
        options: refTypeOptions,
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
        target: 'Account',
        placeholder: t`Account`,
        label: t`Account`,
        fieldname: 'account',
      },
      {
        fieldtype: 'Select',
        options: [
          { label: t`Customer`, value: 'Books Customer' },
          { label: t`Supplier`, value: 'Books Supplier' },
        ],
        label: t`Party Type`,
        fieldname: 'partyType',
        placeholder: t`Party Type`,
      },
      {
        fieldtype: 'DynamicLink',
        label: t`Party`,
        references: 'partyType',
        placeholder: t`Party`,
        emptyMessage: t`Change Party Type`,
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
          { label: t`Reference`, value: 'voucher_no' },
        ],
      },
      {
        fieldtype: 'Check',
        label: t`Include Cancelled`,
        fieldname: 'isCancelled',
      },
      {
        fieldtype: 'Check',
        label: t`Ascending Order`,
        fieldname: 'ascending',
      },
    ] as Field[];
  }
}
