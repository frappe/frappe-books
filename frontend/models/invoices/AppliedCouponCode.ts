import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';

/** A coupon applied to a sales invoice; coupons are made on their own list, not from here. */
export class AppliedCouponCode extends FrappeDoc {
  static override presentation = {
    label: 'Applied Coupon Codes',
    fields: withoutCreate(['coupons']),
  };

  coupons?: string;
}
