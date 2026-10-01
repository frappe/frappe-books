import { Fyo } from 'fyo';
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
      'number_series',
      'entry_type',
      'posting_date',
      'accounts',
      'reference_number',
      'reference_date',
      'user_remark',
      'attachment',
      'status',
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
    const debit = this.getSum('accounts', 'debit', false) as Money;
    const difference = debit.sub(this.getSum('accounts', 'credit', false));
    const row = ((this.accounts ?? []) as FrappeDoc[]).find(
      (row) => (row.debit as Money).isZero() && (row.credit as Money).isZero()
    );
    if (row && !difference.isZero()) {
      row[difference.isNegative() ? 'debit' : 'credit'] = difference.abs();
    }
  }

  static filters: FiltersMap = {
    number_series: () => [['reference_type', '=', 'JournalEntry']],
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
        'entry_type',
        'reference_number',
      ],
    };
  }
}
