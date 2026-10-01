import { PaymentMethodType } from 'models/types';

export type PaymentMethodRequirements = {
  isCash: boolean;
  requiresReferenceId: boolean;
  requiresClearanceDate: boolean;
};

/** What a payment by the method needs, as the server's validate_payment_details checks it. */
export function getPaymentMethodRequirements(
  type?: PaymentMethodType,
  requiresClearanceDate = false
): PaymentMethodRequirements {
  const isCash = type === 'Cash';

  return {
    isCash,
    requiresReferenceId: Boolean(type && !isCash),
    requiresClearanceDate: Boolean(requiresClearanceDate),
  };
}
