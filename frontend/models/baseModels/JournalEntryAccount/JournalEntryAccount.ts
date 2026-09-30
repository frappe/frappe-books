import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Journal Entry Account row. */
export class JournalEntryAccount extends FrappeDoc {
  static override presentation = {
    label: 'Journal Entry Account',
    fields: { account: { groupBy: 'rootType' } },
  };

  // Accounts are still read through the bridge, so this uses its field names.
  static filters: FiltersMap = {
    account: () => ({ isGroup: false }),
  };
}
