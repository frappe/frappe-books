import { Fyo } from 'fyo';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { PurchaseInvoiceItem } from './InvoiceItem';
import { TaxesAndCharges } from './TaxesAndCharges';

export class PurchaseInvoice extends Invoice {
  static override doctype = 'Books Purchase Invoice';
  static override presentation = {
    label: 'Purchase Invoice',
    nameField: { label: 'Invoice No', hidden: true },
    fields: INVOICE_FIELDS,
    fileFields: [
      'name',
      'naming_series',
      'supplier',
      'credit_to',
      'posting_date',
      'buying_price_list',
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
      'make_auto_payment',
      'make_auto_stock_transfer',
      'outstanding_amount',
      'per_received',
      'terms',
      'return_against',
      'status',
    ],
  };
  static override partyField = 'supplier';
  static override partyAccountField = 'credit_to';
  static override rowModels = {
    items: PurchaseInvoiceItem,
    taxes: TaxesAndCharges,
  };

  per_received?: number;

  override hidden: HiddenMap = {
    ...this.hidden,
    ...this.postingHidden,
  };

  /** The server sets every row received, 100%, once nothing is left to receive. */
  override get hasStockToTransfer(): boolean {
    return (this.per_received ?? 0) < 100;
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'supplier',
        'posting_date',
        'base_grand_total',
        'outstanding_amount',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getInvoiceActions(fyo, ModelNameEnum.PurchaseInvoice);
  }
}
