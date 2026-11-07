import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { fyo } from 'src/initFyo';

/** Whether the POS offers coupons on the sale: the feature is on and its totals can still change. */
export function isCouponOffered(sale: SalesInvoice): boolean {
  return (
    !!fyo.singles.AccountingSettings?.enable_coupon_code && !sale.isSubmitted
  );
}

/** Whether the POS offers points on the sale: also a sale, not a return, whose customer has a program. */
export function isLoyaltyOffered(sale: SalesInvoice): boolean {
  return (
    !!fyo.singles.AccountingSettings?.enable_loyalty_program &&
    !sale.isSubmitted &&
    !sale.isReturn &&
    !!sale.loyalty_program
  );
}

/** Whether the POS offers another price list on the sale. */
export function isPriceListOffered(sale: SalesInvoice): boolean {
  return (
    !!fyo.singles.AccountingSettings?.enable_price_list && !sale.isSubmitted
  );
}

/** Whether the cashier can apply a coupon now; the server checks it again at save. */
export function canApplyCoupon(sale: SalesInvoice): boolean {
  return isCouponOffered(sale) && hasItemsAndCustomer(sale);
}

/** Whether the cashier can redeem points now: also needs points left. */
export function canRedeemLoyalty(sale: SalesInvoice): boolean {
  return (
    isLoyaltyOffered(sale) &&
    hasItemsAndCustomer(sale) &&
    (sale.available_loyalty_points ?? 0) > 0
  );
}

/** Redeems `points` on the sale; refuses, as its save does, more points than the customer has or than it costs. */
export async function redeemLoyaltyPoints(sale: SalesInvoice, points: number) {
  const available = sale.available_loyalty_points ?? 0;
  if (points > available) {
    throw new ValidationError(
      t`Customer ${sale.party ?? ''} has only ${available} available loyalty points.`
    );
  }

  await sale.set('loyalty_points', points);
  await sale.set('redeem_loyalty_points', points > 0);
  await sale.preview();
  if (sale.grand_total?.isNegative()) {
    throw new ValidationError(
      t`Loyalty redemption cannot exceed the invoice total.`
    );
  }
}

function hasItemsAndCustomer(sale: SalesInvoice): boolean {
  return !!sale.items?.length && !!sale.party;
}
