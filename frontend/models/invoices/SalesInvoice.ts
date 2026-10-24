import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { Action, HiddenMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getInvoiceActions } from 'models/helpers';
import { getInsufficientItems } from 'models/inventory/insufficientStock';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { SubmitWarning } from 'src/frappe/document';
import { getLoyaltyPoints } from './loyalty';
import { INVOICE_FIELDS, Invoice } from './Invoice';
import { SalesInvoiceItem } from './InvoiceItem';
import { PricingRuleDetail } from './PricingRuleDetail';
import { SalesInvoicePayment } from './SalesInvoicePayment';
import { TaxesAndCharges } from './TaxesAndCharges';

export class SalesInvoice extends Invoice {
  static override doctype = 'Books Sales Invoice';
  static override presentation = {
    label: 'Sales Invoice',
    nameField: { label: 'Invoice No', hidden: true },
    fields: INVOICE_FIELDS,
    fileFields: [
      'name',
      'naming_series',
      'customer',
      'debit_to',
      'posting_date',
      'selling_price_list',
      'items',
      'taxes_and_charges',
      'taxes',
      'net_total',
      'total_taxes_and_charges',
      'loyalty_amount',
      'base_grand_total',
      'grand_total',
      'currency',
      'conversion_rate',
      'discount_after_tax',
      'make_auto_payment',
      'make_auto_stock_transfer',
      'outstanding_amount',
      'stock_not_transferred',
      'terms',
      'return_against',
      'status',
      'coupon_code',
      'loyalty_program',
      'redeem_loyalty_points',
      'loyalty_points',
      'payments',
      'pricing_rules',
    ],
  };
  static override partyField = 'customer';
  static override partyAccountField = 'debit_to';
  static override rowModels = {
    items: SalesInvoiceItem,
    taxes: TaxesAndCharges,
    payments: SalesInvoicePayment,
    pricing_rules: PricingRuleDetail,
  };

  customer?: string;
  coupon_code?: string;
  stock_not_transferred?: number;
  loyalty_amount?: Money;
  /** The customer's program, as the server's preview fills it. */
  loyalty_program?: string;
  /** The points the customer can redeem, as the server counts them. */
  availableLoyaltyPoints = 0;
  _loyaltyPointsKey?: string;

  override hidden: HiddenMap = {
    ...this.hidden,
    ...this.postingHidden,
    coupon_code: () => !this.fyo.isFeatureOn('enable_coupon_code'),
    pricing_rules: () => !this.fyo.isFeatureOn('enable_pricing_rule'),
    redeem_loyalty_points: () =>
      !this.redeem_loyalty_points && this.availableLoyaltyPoints <= 0,
  };

  override get hasStockToTransfer(): boolean {
    return (this.stock_not_transferred ?? 0) > 0;
  }

  override applyPreview(previewed: DocValueMap) {
    super.applyPreview(previewed);
    void this.loadLoyaltyPoints();
  }

  /** Counts the customer's redeemable points again when the customer or program changes. */
  async loadLoyaltyPoints() {
    const key = `${this.customer ?? ''}:${this.loyalty_program ?? ''}`;
    if (key === this._loyaltyPointsKey) {
      return;
    }

    this._loyaltyPointsKey = key;
    this.availableLoyaltyPoints =
      this.customer && this.loyalty_program
        ? await getLoyaltyPoints(this.customer, this.loyalty_program)
        : 0;
  }

  /** The server ships no short stock, so a Yes submits without the shipment. */
  override async getSubmitWarning(): Promise<SubmitWarning | undefined> {
    if (!this.make_auto_stock_transfer) {
      return undefined;
    }

    const insufficient = await getInsufficientItems(this);
    if (!insufficient.length) {
      return undefined;
    }

    const list = insufficient
      .map(({ item_code, stock_qty }) => `${item_code} (${stock_qty})`)
      .join(', ');
    return {
      title: this.fyo.t`Insufficient quantity`,
      detail: [
        this.fyo
          .t`The following items have insufficient quantity for Delivery Note: ${list}`,
        this.fyo.t`Continue submitting Sales Invoice?`,
      ],
      accept: () => this.set('make_auto_stock_transfer', false),
    };
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'customer',
        'posting_date',
        'base_grand_total',
        'outstanding_amount',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getInvoiceActions(fyo, ModelNameEnum.SalesInvoice);
  }
}
