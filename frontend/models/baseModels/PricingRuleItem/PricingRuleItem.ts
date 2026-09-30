import { FrappeDoc } from 'src/frappe/document';

/** A Books Pricing Rule Item row; its item is picked, not created. */
export class PricingRuleItem extends FrappeDoc {
  static override presentation = {
    label: '',
    fields: { item: { create: false } },
  };
}
