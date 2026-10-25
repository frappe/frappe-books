import { FiltersMap } from 'fyo/model/types';
import { PARTY_TYPE_OPTIONS } from 'models/baseModels/PaymentEntry/PaymentEntry';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Journal Entry Account row; its party, a customer or supplier, is optional. */
export class JournalEntryAccount extends FrappeDoc {
  static override presentation = {
    label: 'Journal Entry Account',
    fields: {
      account: { groupBy: 'root_type', create: false },
      party_type: { options: PARTY_TYPE_OPTIONS },
    },
  };

  static filters: FiltersMap = {
    account: () => [['is_group', '=', 0]],
  };
}
