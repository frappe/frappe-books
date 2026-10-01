import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Ledger Entry, served by Frappe. Only the server posts and reverts entries. */
export class AccountingLedgerEntry extends FrappeDoc {
  static override doctype = 'Books Ledger Entry';
  static override presentation = {
    label: 'Accounting Ledger Entry',
    nameField: { label: 'Entry No.' },
    quickEditFields: [
      'posting_date',
      'account',
      'party',
      'debit',
      'credit',
      'voucher_type',
      'voucher_no',
      'reverted',
      'reverts',
    ],
  };

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
