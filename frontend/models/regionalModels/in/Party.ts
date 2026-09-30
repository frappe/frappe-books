import { HiddenMap } from 'fyo/model/types';
import { Party as BaseParty } from 'models/baseModels/Party/Party';

/** An Indian party: GST registration instead of a tax ID; loyalty for customers only. */
export class Party extends BaseParty {
  static override presentation = {
    ...BaseParty.presentation,
    quickEditFields: [
      'email',
      'phone',
      'address',
      'default_account',
      'currency',
      'role',
      'gst_type',
      'gstin',
    ],
  };

  // The DocType shows GSTIN for a registered party only.
  hidden: HiddenMap = {
    tax_id: () => true,
    loyalty_program: () =>
      !this.fyo.singles.AccountingSettings?.enable_loyalty_program ||
      this.role === 'Supplier',
    loyalty_points: () => !this.loyalty_program || this.role === 'Supplier',
  };
}
