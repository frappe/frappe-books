import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books GL Entry, served by Frappe. Only the server posts and cancels entries. */
export class GLEntry extends FrappeDoc {
  static override doctype = 'Books GL Entry';
  static override presentation = {
    label: 'GL Entry',
    nameField: { label: 'Entry No.' },
    quickEditFields: [
      'posting_date',
      'account',
      'party_type',
      'party',
      'debit',
      'credit',
      'voucher_type',
      'voucher_no',
      'is_cancelled',
    ],
  };

  static override partyField = 'party';

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'posting_date',
        'account',
        'party',
        'debit',
        'credit',
        'voucher_no',
      ],
    };
  }
}
