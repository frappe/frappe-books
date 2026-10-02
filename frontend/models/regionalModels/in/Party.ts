import { Party as BaseParty } from 'models/baseModels/Party/Party';

/** An Indian party: GST registration instead of a tax ID. */
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
    omitFields: ['tax_id'],
  };
}
