import { Doc } from 'fyo/model/doc';
import { FiltersMap } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Invoice } from '../Invoice/Invoice';
import { SalesQuoteItem } from '../SalesQuoteItem/SalesQuoteItem';

/** A quote read through the bridge; /books forms use models/invoices. */
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
}
