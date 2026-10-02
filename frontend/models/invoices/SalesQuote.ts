import { Fyo } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getQuoteActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { SalesQuoteItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

/** A quote to a customer or a lead; its Type names the doctype of its party. */
export class SalesQuote extends Invoice {
  static override doctype = 'Books Sales Quote';
  static override presentation = {
    label: 'Quote',
    nameField: { label: 'Invoice No', hidden: true },
    fields: {
      ...INVOICE_FIELDS,
      reference_type: {
        options: [
          { value: 'Books Party', label: 'Party' },
          { value: 'Books Lead', label: 'Lead' },
        ],
      },
    },
    fileFields: [
      'name',
      'number_series',
      'party',
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
      'reference_type',
    ],
  };
  static override rowModels = { items: SalesQuoteItem, taxes: TaxSummary };

  static override filters: FiltersMap = {
    // Leads have no role.
    party: (doc: FrappeDoc) =>
      doc.reference_type === 'Books Party' ? Invoice.filters.party(doc) : [],
    number_series: Invoice.filters.number_series,
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
        'party',
        'date',
        'base_grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getQuoteActions(fyo, ModelNameEnum.SalesQuote);
  }
}
