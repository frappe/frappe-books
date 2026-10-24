import { ChangeArg, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Coupon Code, served by Frappe. A coupon is named by its name; cashiers type its code. */
export class CouponCode extends FrappeDoc {
  static override doctype = 'Books Coupon Code';
  static override presentation = {
    label: 'Coupon Code',
    quickEditFields: [
      'coupon_name',
      'coupon_code',
      'pricing_rule',
      'valid_from',
      'valid_upto',
      'maximum_use',
      'used',
    ],
    fields: { pricing_rule: { create: false } },
  };

  coupon_name?: string;
  coupon_code?: string;
  /** The code last made from the name, which a new name replaces. */
  _nameCode?: string;

  override async change(change: ChangeArg) {
    await super.change(change);
    // Mirrors the server, which gives a coupon without a code one made from its name.
    const isNameCode = !this.coupon_code || this.coupon_code === this._nameCode;
    if (change.changed !== 'coupon_name' || !this.notInserted || !isNameCode) {
      return;
    }

    this._nameCode = getCouponCode(this.coupon_name);
    this.coupon_code = this._nameCode;
  }

  // Pricing rules are Frappe-backed, so their filters use Frappe fieldnames.
  static filters: FiltersMap = {
    pricing_rule: () => [['coupon_code_based', '=', 1]],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'coupon_code', 'pricing_rule', 'maximum_use', 'used'],
    };
  }
}

/** Books' code for a coupon name: no spaces, upper case, at most 8 letters. */
function getCouponCode(name = ''): string {
  return name.replace(/\s+/g, '').toUpperCase().slice(0, 8);
}
