import { Fyo } from 'fyo';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getQuoteActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { QuotationItem } from './InvoiceItem';
import { TaxesAndCharges } from './TaxesAndCharges';

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
      'transaction_date',
      'selling_price_list',
      'items',
      'taxes_and_charges',
      'taxes',
      'net_total',
      'total_taxes_and_charges',
      'base_grand_total',
      'grand_total',
      'currency',
      'conversion_rate',
      'discount_after_tax',
      'terms',
      'status',
      'quotation_to',
    ],
  };
  static override partyField = 'party_name';
  static override rowModels = { items: QuotationItem, taxes: TaxesAndCharges };
  // The exchange rate is the one on the quote's date.
  static override refills = { transaction_date: ['conversion_rate'] };

  // A quote has no party account.
  static override filters: FiltersMap = {
    naming_series: Invoice.filters.naming_series,
    selling_price_list: Invoice.filters.selling_price_list,
    taxes_and_charges: Invoice.filters.taxes_and_charges,
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
        'transaction_date',
        'base_grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getQuoteActions(fyo, ModelNameEnum.Quotation);
  }
}
