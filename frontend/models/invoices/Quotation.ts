import { Fyo } from 'fyo';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getQuoteActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { QuotationItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

/** A quote to a customer or a lead; its Type names the doctype of its party. */
export class Quotation extends Invoice {
  static override doctype = 'Books Quotation';
  static override presentation = {
    label: 'Quotation',
    nameField: { label: 'Invoice No', hidden: true },
    fields: {
      ...INVOICE_FIELDS,
      quotation_to: {
        options: [
          { value: 'Books Customer', label: 'Customer' },
          { value: 'Books Lead', label: 'Lead' },
        ],
      },
    },
    fileFields: [
      'name',
      'naming_series',
      'party_name',
      'date',
      'price_list',
      'items',
      'net_total',
      'total_discount',
      'taxes',
      'base_grand_total',
      'grand_total',
      'currency',
      'exchange_rate',
      'discount_after_tax',
      'outstanding_amount',
      'terms',
      'attachment',
      'status',
      'quotation_to',
    ],
  };
  static override partyField = 'party_name';
  static override rowModels = { items: QuotationItem, taxes: TaxSummary };

  // A quote has no party account.
  static override filters: FiltersMap = {
    naming_series: Invoice.filters.naming_series,
    price_list: Invoice.filters.price_list,
  };

  /** Quotes post no ledger entries. */
  override get isTransactional(): boolean {
    return false;
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party_name',
        'date',
        'base_grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getQuoteActions(fyo, ModelNameEnum.Quotation);
  }
}
