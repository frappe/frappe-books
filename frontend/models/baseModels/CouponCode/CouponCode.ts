import { ChangeArg, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Coupon Code, served by Frappe. The server names a coupon from its name. */
export class CouponCode extends FrappeDoc {
  static override doctype = 'Books Coupon Code';
  static override presentation = {
    label: 'Coupon Code',
    nameField: { label: 'Coupon Code' },
    quickEditFields: [
      'name',
      'pricing_rule',
      'valid_from',
      'valid_to',
      'maximum_use',
      'used',
    ],
    fields: { pricing_rule: { create: false } },
  };

  coupon_name?: string;

  override async change(change: ChangeArg) {
    await super.change(change);
    // Mirrors the server's naming, so a new coupon shows its code as its name is typed.
    const code = this.coupon_name
      ?.replace(/\s+/g, '')
      .toUpperCase()
      .slice(0, 8);
    if (change.changed === 'coupon_name' && this.notInserted && code) {
      this.name = code;
    }
  }

  // Pricing rules are Frappe-backed, so their filters use Frappe fieldnames.
  static filters: FiltersMap = {
    pricing_rule: () => [['is_coupon_code_based', '=', 1]],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'coupon_name', 'pricing_rule', 'maximum_use', 'used'],
    };
  }
}
