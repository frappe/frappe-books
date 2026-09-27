import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { codeStateMap } from 'regional/in';
import { Report } from 'reports/Report';
import { ColumnField, ReportData, ReportRow } from 'reports/types';
import { Field, OptionField } from 'schemas/types';
import { isNumeric } from 'src/utils';
import getGSTRExportActions from './gstExporter';
import { GSTRRow, GSTRType, TransferType, TransferTypeEnum } from './types';

export abstract class BaseGSTR extends Report {
  place?: string;
  toDate?: string;
  fromDate?: string;
  transferType?: TransferType;
  usePagination = true;
  gstrRows?: GSTRRow[];
  loading = false;

  abstract gstrType: GSTRType;

  get transferTypeMap(): Record<string, string> {
    if (this.gstrType === 'GSTR-2') {
      return {
        B2B: 'B2B',
      };
    }

    return {
      B2B: 'B2B',
      B2CL: 'B2C-Large',
      B2CS: 'B2C-Small',
      NR: 'Nil Rated, Exempted and Non GST supplies',
    };
  }

  get schemaName() {
    if (this.gstrType === 'GSTR-1') {
      return ModelNameEnum.SalesInvoice;
    }

    return ModelNameEnum.PurchaseInvoice;
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    this.gstrRows = await this.fyo.db.getReportData<GSTRRow[]>(
      'getGSTRRows',
      this.schemaName,
      this.filterMap
    );
    this.reportData = this.getReportDataFromGSTRRows(this.gstrRows);
    this.loading = false;
  }

  getReportDataFromGSTRRows(gstrRows: GSTRRow[]): ReportData {
    const reportData: ReportData = [];
    for (const row of gstrRows) {
      const reportRow: ReportRow = { cells: [] };

      for (const { fieldname, fieldtype, width } of this.columns) {
        const align = isNumeric(fieldtype) ? 'right' : 'left';

        const rawValue = row[fieldname as keyof GSTRRow];
        let value = '';
        if (rawValue !== undefined) {
          value = this.fyo.format(rawValue, fieldtype);
        }

        reportRow.cells.push({
          align,
          rawValue,
          value,
          width: width ?? 1,
        });
      }

      reportData.push(reportRow);
    }

    return reportData;
  }

  setDefaultFilters() {
    if (!this.toDate) {
      this.toDate = DateTime.local().toISODate();
    }

    if (!this.fromDate) {
      this.fromDate = DateTime.local().minus({ months: 3 }).toISODate();
    }

    if (!this.transferType) {
      this.transferType = 'B2B';
    }
  }

  getFilters(): Field[] {
    const transferTypeMap = this.transferTypeMap;
    const options = Object.keys(transferTypeMap).map((k) => ({
      value: k,
      label: transferTypeMap[k],
    }));

    return [
      {
        fieldtype: 'Select',
        label: t`Transfer Type`,
        placeholder: t`Transfer Type`,
        fieldname: 'transferType',
        options,
      } as OptionField,
      {
        fieldtype: 'AutoComplete',
        label: t`Place`,
        placeholder: t`Place`,
        fieldname: 'place',
        options: Object.keys(codeStateMap).map((code) => {
          return {
            value: code,
            label: codeStateMap[code],
          };
        }),
      } as OptionField,
      {
        fieldtype: 'Date',
        label: t`From Date`,
        placeholder: t`From Date`,
        fieldname: 'fromDate',
      },
      {
        fieldtype: 'Date',
        label: t`To Date`,
        placeholder: t`To Date`,
        fieldname: 'toDate',
      },
    ];
  }

  getColumns(): ColumnField[] | Promise<ColumnField[]> {
    const columns = [
      {
        label: t`Party`,
        fieldtype: 'Data',
        fieldname: 'partyName',
        width: 1.5,
      },
      {
        label: t`Invoice No.`,
        fieldname: 'invNo',
        fieldtype: 'Data',
      },
      {
        label: t`Invoice Value`,
        fieldname: 'invAmt',
        fieldtype: 'Currency',
      },
      {
        label: t`Invoice Date`,
        fieldname: 'invDate',
        fieldtype: 'Date',
      },
      {
        label: t`Place of supply`,
        fieldname: 'place',
        fieldtype: 'Data',
      },
      {
        label: t`Rate`,
        fieldname: 'rate',
        width: 0.5,
      },
      {
        label: t`Taxable Value`,
        fieldname: 'taxVal',
        fieldtype: 'Currency',
      },
      {
        label: t`Reverse Chrg.`,
        fieldname: 'reverseCharge',
        fieldtype: 'Data',
      },
      {
        label: t`Integrated Tax`,
        fieldname: 'igstAmt',
        fieldtype: 'Currency',
      },
      {
        label: t`Central Tax`,
        fieldname: 'cgstAmt',
        fieldtype: 'Currency',
      },
      {
        label: t`State Tax`,
        fieldname: 'sgstAmt',
        fieldtype: 'Currency',
      },
    ] as ColumnField[];

    const transferType = this.transferType ?? TransferTypeEnum.B2B;
    if (transferType === TransferTypeEnum.B2B) {
      columns.unshift({
        label: t`GSTIN No.`,
        fieldname: 'gstin',
        fieldtype: 'Data',
        width: 1.5,
      });
    }

    return columns;
  }

  getActions(): Action[] {
    return getGSTRExportActions(this);
  }
}
