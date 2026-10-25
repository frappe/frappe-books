import { FiltersMap } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';

/** Cash modes take cash accounts; other modes cash or bank, as the server checks. */
export function getModeAccountFilters(type: unknown): Filter[] {
  return [
    ['is_group', '=', 0],
    type === 'Cash'
      ? ['account_type', '=', 'Cash']
      : ['account_type', 'in', ['Cash', 'Bank']],
  ];
}

/** A Books Mode of Payment Account row: a mode's default account for a company. */
export class ModeOfPaymentAccount extends FrappeDoc {
  static override presentation = {
    label: 'Mode of Payment Account',
    fields: { default_account: { create: false } },
  };

  static override filters: FiltersMap = {
    default_account: (doc: FrappeDoc) =>
      getModeAccountFilters(doc.parentdoc?.type),
  };
}
