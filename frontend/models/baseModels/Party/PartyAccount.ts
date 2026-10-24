import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Party } from './Party';

/** A Books Party Account row: a customer's or supplier's ledger account for a company. */
export class PartyAccount extends FrappeDoc {
  static override presentation = { label: 'Default Accounts' };

  // A customer's account is receivable, a supplier's payable.
  static override filters: FiltersMap = {
    account: (doc: FrappeDoc) => [
      ['is_group', '=', 0],
      [
        'account_type',
        '=',
        (doc.parentdoc?.constructor as typeof Party | undefined)?.accountType,
      ],
    ],
  };
}
