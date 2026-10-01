import { FrappeDoc } from 'src/frappe/document';

/** A Books Pricing Rule Detail row: a pricing rule an invoice item got. */
export class PricingRuleDetail extends FrappeDoc {
  static override presentation = { label: 'Pricing Rule Detail' };
}
