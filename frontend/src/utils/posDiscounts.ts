import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { getList } from 'src/frappe/api';
import { toActiveDoctype } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';

/** Whether the POS offers coupons on the sale: the feature is on and its totals can still change. */
export function isCouponOffered(sale: SalesInvoice): boolean {
  return fyo.isFeatureOn('enable_coupon_code') && !sale.isSubmitted;
}

/** Whether the POS offers points on the sale: also a sale, not a return, whose customer has a program. */
export function isLoyaltyOffered(sale: SalesInvoice): boolean {
  return (
    fyo.isFeatureOn('enable_loyalty_point_program') &&
    !sale.isSubmitted &&
    !sale.isReturn &&
    !!sale.loyalty_program
  );
}

/** Whether the POS offers another price list on the sale. */
export function isPriceListOffered(sale: SalesInvoice): boolean {
  return fyo.isFeatureOn('enable_price_list') && !sale.isSubmitted;
}

/** Whether the cashier can apply a coupon now; the server checks it again at save. */
export function canApplyCoupon(sale: SalesInvoice): boolean {
  return isCouponOffered(sale) && hasItemsAndCustomer(sale);
}

/** The coupon a typed code is for, as ERPNext looks codes up; else `code` names the coupon. */
export async function getCouponName(code: string): Promise<string> {
  const [coupon] = await getList(toActiveDoctype('Books Coupon Code'), {
    fields: ['name'],
    filters: [['coupon_code', '=', code]],
    limit: 1,
  });
  return (coupon?.name as string | undefined) ?? code;
}

/** Whether the cashier can redeem points now: also needs points left. */
export function canRedeemLoyalty(sale: SalesInvoice): boolean {
  return (
    isLoyaltyOffered(sale) &&
    hasItemsAndCustomer(sale) &&
    sale.availableLoyaltyPoints > 0
  );
}

function hasItemsAndCustomer(sale: SalesInvoice): boolean {
  return !!sale.items?.length && !!sale.customer;
}
