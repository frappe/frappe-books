import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { fyo } from 'src/initFyo';

/** Whether the cashier can apply a coupon: the feature is on and the sale is open. */
export function canApplyCoupon(sale: SalesInvoice): boolean {
  return (
    !!fyo.singles.AccountingSettings?.enable_coupon_code && isSaleOpen(sale)
  );
}

/** Whether the cashier can redeem points: also needs a sale, not a return, whose customer has a program and points. */
export function canRedeemLoyalty(sale: SalesInvoice): boolean {
  return (
    !!fyo.singles.AccountingSettings?.enable_loyalty_program &&
    isSaleOpen(sale) &&
    !sale.isReturn &&
    !!sale.loyalty_program &&
    (sale.available_loyalty_points ?? 0) > 0
  );
}

/** A sale with items and a customer whose totals can still change; the server checks discounts again at save. */
function isSaleOpen(sale: SalesInvoice): boolean {
  return !!sale.items?.length && !!sale.party && !sale.isSubmitted;
}
