import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { Report } from 'reports/Report';
import { Field, OptionField } from 'schemas/types';
import getGSTRExportActions from './gstExporter';
import { call } from 'src/web/api';
import { GSTRType, TransferType } from './types';

export abstract class BaseGSTR extends Report {
  place?: string;
  toDate?: string;
  fromDate?: string;
  transferType?: TransferType;
  usePagination = true;
  indianStates: Record<string, string> = {};

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

  async setDefaultFilters() {
    const defaults = await this.getDefaultFilters();
    await this.setIndianStates();
    this.toDate ??= defaults.toDate as string;
    this.fromDate ??= defaults.fromDate as string;
    this.transferType ??= defaults.transferType as TransferType;
  }

  /** The place filter offers the states the server knows by GST state code. */
  async setIndianStates() {
    if (!Object.keys(this.indianStates).length) {
      this.indianStates = await call<Record<string, string>>(
        'frappe_books.regional.get_indian_states'
      );
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
        options: Object.entries(this.indianStates).map(([code, state]) => ({
          value: code,
          label: state,
        })),
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
