import { FrappeDoc } from 'src/frappe/document';

/** A Books Pricing Rule Item row; its item is picked, not created, and its unit follows it. */
export class PricingRuleItem extends FrappeDoc {
  static override presentation = {
    label: 'Pricing Rule Item',
    fields: { item: { create: false } },
  };
  // The server fetches an empty unit from the item.
  static override refills = { item: ['unit'] };
}
