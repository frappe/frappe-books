import { Fyo } from 'fyo';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
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
    nameField: { label: 'Invoice No', hidden: true },
    rowEditTables: ['items'],
    noCreate: NO_CREATE,
  };
  static override tableModels = {
    items: SalesInvoiceItem,
    taxes: TaxSummary,
    coupons: AppliedCouponCode,
  };

  override hidden: HiddenMap = {
    ...this.hidden,
    make_auto_stock_transfer: () => this.isAutoStockTransferHidden,
    coupons: () => !this.fyo.singles.AccountingSettings?.enable_coupon_code,
    pricing_rule_detail: () =>
      !this.fyo.singles.AccountingSettings?.enable_pricing_rule,
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
