import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Mode of Payment Account row: a mode's default account for a company. */
export class ModeOfPaymentAccount extends FrappeDoc {
  static override presentation = {
    label: 'Mode of Payment Account',
    fields: { default_account: { create: false } },
  };

  // Cash modes take cash accounts; other modes cash or bank, as the server checks.
  static override filters: FiltersMap = {
    default_account: (doc: FrappeDoc) => [
      ['is_group', '=', 0],
      doc.parentdoc?.type === 'Cash'
        ? ['account_type', '=', 'Cash']
        : ['account_type', 'in', ['Cash', 'Bank']],
    ],
  };
}
