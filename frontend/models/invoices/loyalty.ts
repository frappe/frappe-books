import { call } from 'src/web/api';

const LOYALTY_DETAILS =
  'frappe_books.commerce.loyalty.get_loyalty_program_details_with_points';

type LoyaltyDetails = { loyalty_points?: number; conversion_factor?: number };

/** The points a customer can redeem in a loyalty program, as the server counts them. */
export async function getLoyaltyPoints(
  customer: string,
  loyaltyProgram: string
): Promise<number> {
  const details = await call<LoyaltyDetails>(LOYALTY_DETAILS, {
    customer,
    loyalty_program: loyaltyProgram,
  });
  return details?.loyalty_points ?? 0;
}
