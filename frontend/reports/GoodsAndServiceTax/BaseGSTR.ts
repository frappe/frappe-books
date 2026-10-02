import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { Report } from 'reports/Report';
import { Field, OptionField } from 'schemas/types';
import getGSTRExportActions from './gstExporter';
import { GSTRType, TransferType } from './types';

export abstract class BaseGSTR extends Report {
  place?: string;
  toDate?: string;
  fromDate?: string;
  transferType?: TransferType;
  usePagination = true;

  abstract gstrType: GSTRType;

  get transferTypeMap(): Record<string, string> {
    if (this.gstrType === 'GSTR-2') {
      return {
        B2B: 'B2B',
        CDNR: 'Credit/Debit Notes (Registered)',
        NR: 'Nil Rated, Exempted and Non GST supplies',
      };
    }

    return {
      B2B: 'B2B',
      B2CL: 'B2C-Large',
      B2CS: 'B2C-Small',
      CDNR: 'Credit/Debit Notes (Registered)',
      CDNUR: 'Credit/Debit Notes (Unregistered)',
      NR: 'Nil Rated, Exempted and Non GST supplies',
    };
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
        // The server boots the states by GST state code.
        options: Object.entries(this.fyo.store.indianStates).map(
          ([code, state]) => ({ value: code, label: state })
        ),
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
