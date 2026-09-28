import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { getDocStatusListColumn, getInvoiceActions } from '../../helpers';
import { Invoice } from '../Invoice/Invoice';
import { SalesInvoiceItem } from '../SalesInvoiceItem/SalesInvoiceItem';

export class SalesInvoice extends Invoice {
  items?: SalesInvoiceItem[];
  payments?: Doc[];

  override hidden: HiddenMap = {
    ...this.hidden,
    payments: () => !this.payments?.length,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'baseGrandTotal',
        'outstandingAmount',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getInvoiceActions(fyo, ModelNameEnum.SalesInvoice);
  }
}
