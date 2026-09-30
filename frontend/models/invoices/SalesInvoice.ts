import { Fyo } from 'fyo';
import { Action, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { AppliedCouponCode } from './AppliedCouponCode';
import { Invoice, NO_CREATE } from './Invoice';
import { SalesInvoiceItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

export class SalesInvoice extends Invoice {
  static override doctype = 'Books Sales Invoice';
  static override presentation = {
    label: 'Sales Invoice',
    nameField: { label: 'Invoice No' },
    rowEditTables: ['items'],
    noCreate: NO_CREATE,
  };
  static override tableModels = {
    items: SalesInvoiceItem,
    taxes: TaxSummary,
    coupons: AppliedCouponCode,
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
    return getInvoiceActions(fyo, ModelNameEnum.SalesInvoice);
  }
}
