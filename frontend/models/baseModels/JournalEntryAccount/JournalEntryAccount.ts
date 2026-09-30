import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Journal Entry Account row. */
export class JournalEntryAccount extends FrappeDoc {
  static override presentation = {
    label: 'Journal Entry Account',
    // Getdoctype sends no only_select, so the model says the link offers no Create, as before.
    fields: { account: { groupBy: 'rootType', create: false } },
  };

  // Accounts are still read through the bridge, so this uses its field names.
  static filters: FiltersMap = {
    account: () => ({ isGroup: false }),
  };
}
