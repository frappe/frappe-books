import { FrappeDoc } from 'src/frappe/document';

/** A Books Pricing Rule Item Code row; its item is picked, not created, and its UOM follows it. */
export class PricingRuleItemCode extends FrappeDoc {
  static override presentation = {
    label: 'Pricing Rule Item Code',
    fields: { item_code: { create: false } },
  };
  // The server fetches an empty UOM from the item.
  static override refills = { item_code: ['uom'] };
}
