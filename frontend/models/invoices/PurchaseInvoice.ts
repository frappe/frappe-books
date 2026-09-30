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
  };
  static override rowModels = {
    items: PurchaseInvoiceItem,
    taxes: TaxSummary,
  };

  override hidden: HiddenMap = {
    ...this.hidden,
    make_auto_stock_transfer: () => this.isAutoStockTransferHidden,
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
