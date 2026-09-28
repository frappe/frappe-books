import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { codeStateMap } from 'regional/in';
import { Report } from 'reports/Report';
import { Field, OptionField } from 'schemas/types';
import getGSTRExportActions from './gstExporter';
import { GSTRRow, GSTRType, TransferType } from './types';

export abstract class BaseGSTR extends Report {
  place?: string;
  toDate?: string;
  fromDate?: string;
  transferType?: TransferType;
  usePagination = true;
  gstrRows: GSTRRow[] = [];

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

  async runReport() {
    const result = await super.runReport();
    this.gstrRows = result.rows as unknown as GSTRRow[];
    return result;
  }

  async setDefaultFilters() {
    const defaults = await this.getDefaultFilters();
    this.toDate ??= defaults.toDate as string;
    this.fromDate ??= defaults.fromDate as string;
    this.transferType ??= defaults.transferType as TransferType;
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

  getActions(): Action[] {
    return getGSTRExportActions(this);
  }
}
