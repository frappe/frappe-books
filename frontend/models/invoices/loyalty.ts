import { getAccessoryCompany, isAccessoryMode } from 'src/frappe/mode';
import { call } from 'src/web/api';

const LOYALTY_DETAILS =
  'frappe_books.commerce.loyalty.get_loyalty_program_details_with_points';
const ERPNEXT_LOYALTY_DETAILS =
  'erpnext.accounts.doctype.loyalty_program.loyalty_program.get_loyalty_program_details_with_points';

type LoyaltyDetails = { loyalty_points?: number; conversion_factor?: number };

/** The points a customer can redeem in a loyalty program, as Books' server, or ERPNext's, counts them. */
export async function getLoyaltyPoints(
  customer: string,
  loyaltyProgram: string
): Promise<number> {
  const details = isAccessoryMode()
    ? await call<LoyaltyDetails>(ERPNEXT_LOYALTY_DETAILS, {
        customer,
        loyalty_program: loyaltyProgram,
        company: getAccessoryCompany(),
        silent: true,
      })
    : await call<LoyaltyDetails>(LOYALTY_DETAILS, {
        customer,
        loyalty_program: loyaltyProgram,
      });
  return details?.loyalty_points ?? 0;
}
