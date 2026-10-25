import { FrappeDoc } from 'src/frappe/document';

/** A Books Loyalty Program Collection row: a tier of a loyalty program. */
export class LoyaltyProgramCollection extends FrappeDoc {
  static override presentation = { label: 'Collection Rules' };
}
