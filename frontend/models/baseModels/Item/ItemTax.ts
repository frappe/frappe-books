import { FrappeDoc } from 'src/frappe/document';

/** A Books Item Tax row: the tax template an item or item group applies from a date. */
export class ItemTax extends FrappeDoc {
  static override presentation = { label: 'Item Tax' };
}
