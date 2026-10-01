import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Loyalty Point Entry, served by Frappe. Only the server posts entries. */
export class LoyaltyPointEntry extends FrappeDoc {
  static override doctype = 'Books Loyalty Point Entry';
  static override presentation = {
    label: 'Loyalty Point Entry',
    nameField: { label: 'Entry No.' },
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'loyalty_program',
        'customer',
        'purchase_amount',
        'loyalty_points',
      ],
    };
  }
}
