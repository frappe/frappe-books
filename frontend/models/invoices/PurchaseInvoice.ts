import { Fyo } from 'fyo';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { PurchaseInvoiceItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

export class PurchaseInvoice extends Invoice {
  static override doctype = 'Books Purchase Invoice';
  static override presentation = {
    label: 'Purchase Invoice',
    nameField: { label: 'Invoice No', hidden: true },
    fields: INVOICE_FIELDS,
    fileFields: [
      'name',
      'number_series',
      'party',
      'account',
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
      'make_auto_payment',
      'make_auto_stock_transfer',
      'outstanding_amount',
      'stock_not_transferred',
      'terms',
      'attachment',
      'back_reference',
      'return_against',
      'status',
    ],
  };
  static override rowModels = {
    items: PurchaseInvoiceItem,
    taxes: TaxSummary,
  };

  override hidden: HiddenMap = {
    ...this.hidden,
    ...this.postingHidden,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'base_grand_total',
        'outstanding_amount',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getInvoiceActions(fyo, ModelNameEnum.PurchaseInvoice);
  }
}
