import { Fyo } from 'fyo';
import { Action, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Invoice, NO_CREATE } from './Invoice';
import { PurchaseInvoiceItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

export class PurchaseInvoice extends Invoice {
  static override doctype = 'Books Purchase Invoice';
  static override presentation = {
    label: 'Purchase Invoice',
    nameField: { label: 'Invoice No' },
    rowEditTables: ['items'],
    noCreate: NO_CREATE,
  };
  static override tableModels = {
    items: PurchaseInvoiceItem,
    taxes: TaxSummary,
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
