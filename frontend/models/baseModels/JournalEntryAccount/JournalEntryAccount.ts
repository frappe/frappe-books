import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Journal Entry Account row. */
export class JournalEntryAccount extends FrappeDoc {
  static override presentation = {
    label: 'Journal Entry Account',
    fields: { account: { groupBy: 'root_type', create: false } },
  };

  static filters: FiltersMap = {
    account: () => [['is_group', '=', 0]],
  };
}
