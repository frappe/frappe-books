import { Fyo } from 'fyo';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { AppliedCouponCode } from './AppliedCouponCode';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { SalesInvoiceItem } from './InvoiceItem';
import { PricingRuleDetail } from './PricingRuleDetail';
import { SalesInvoicePayment } from './SalesInvoicePayment';
import { TaxSummary } from './TaxSummary';

export class SalesInvoice extends Invoice {
  static override doctype = 'Books Sales Invoice';
  static override presentation = {
    label: 'Sales Invoice',
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
      'loyalty_points_amount',
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
      'coupons',
      'quote',
      'loyalty_program',
      'available_loyalty_points',
      'redeem_loyalty_points',
      'loyalty_points',
      'payments',
      'pricing_rule_detail',
    ],
  };
  static override rowModels = {
    items: SalesInvoiceItem,
    taxes: TaxSummary,
    coupons: AppliedCouponCode,
    payments: SalesInvoicePayment,
    pricing_rule_detail: PricingRuleDetail,
  };

  coupons?: AppliedCouponCode[];

  override hidden: HiddenMap = {
    ...this.hidden,
    ...this.postingHidden,
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
