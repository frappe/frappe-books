import { FrappeDoc } from 'src/frappe/document';

/** A Books Collection Rules Items row: a tier of a loyalty program. */
export class CollectionRulesItems extends FrappeDoc {
  static override presentation = { label: 'Collection Rules' };
}
