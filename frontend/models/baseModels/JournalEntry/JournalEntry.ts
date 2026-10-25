import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { isDocValueTruthy } from 'src/frappe/docValues';
import {
  Action,
  ChangeArg,
  FiltersMap,
  ListViewSettings,
} from 'fyo/model/types';
import { getDocStatusListColumn, getLedgerLinkAction } from 'models/helpers';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { JournalEntryAccount } from '../JournalEntryAccount/JournalEntryAccount';

// The amounts a row's user enters; the server copies them to its company amounts.
const DEBIT = 'debit_in_account_currency';
const CREDIT = 'credit_in_account_currency';

/**
 * Books Journal Entry, served by Frappe. Its controller fills the number
 * series and checks that debits equal credits.
 */
export class JournalEntry extends FrappeDoc {
  static override doctype = 'Books Journal Entry';
  static override presentation = {
    label: 'Journal Entry',
    nameField: { label: 'Entry No' },
    fileFields: [
      'name',
      'naming_series',
      'voucher_type',
      'posting_date',
      'accounts',
      'cheque_no',
      'cheque_date',
      'user_remark',
    ],
  };
  static override previewMethod = 'preview';
  static override rowModels = { accounts: JournalEntryAccount };

  get isTransactional() {
    return true;
  }

  override async change(arg: ChangeArg) {
    if (arg.changed === 'accounts') {
      this.fillBalancingAmount();
    }

    await super.change(arg);
  }

  /** Mirrors Books: the first row without amounts takes what balances the entry. The server checks the balance. */
  fillBalancingAmount() {
    const debit = this.getSum('accounts', DEBIT, false) as Money;
    const difference = debit.sub(this.getSum('accounts', CREDIT, false));
    const row = ((this.accounts ?? []) as FrappeDoc[]).find(
      (row) =>
        !isDocValueTruthy(row[DEBIT] as DocValue) &&
        !isDocValueTruthy(row[CREDIT] as DocValue)
    );
    if (row && !difference.isZero()) {
      row[difference.isNegative() ? DEBIT : CREDIT] = difference.abs();
    }
  }

  static filters: FiltersMap = {
    naming_series: () => [['reference_type', '=', 'JournalEntry']],
  };

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo)];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'posting_date',
        'voucher_type',
        'cheque_no',
      ],
    };
  }
}
