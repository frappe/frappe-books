import { Fyo } from 'fyo';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { getDocStatusListColumn, getQuoteActions } from '../../helpers';
import { Invoice } from '../Invoice/Invoice';
import { SalesQuoteItem } from '../SalesQuoteItem/SalesQuoteItem';
import { Doc } from 'fyo/model/doc';

export class SalesQuote extends Invoice {
  items?: SalesQuoteItem[];
  party?: string;
  name?: string;
  referenceType?:
    | ModelNameEnum.SalesInvoice
    | ModelNameEnum.PurchaseInvoice
    | ModelNameEnum.Lead;

  static filters: FiltersMap = {
    numberSeries: (doc: Doc) => ({ referenceType: doc.schemaName }),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'baseGrandTotal',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getQuoteActions(fyo, ModelNameEnum.SalesQuote);
  }
}
