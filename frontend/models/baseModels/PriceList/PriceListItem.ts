import { FrappeDoc } from 'src/frappe/document';

/** A Books Price List Item row; its unit is picked, not created, and follows its item. */
export class PriceListItem extends FrappeDoc {
  static override presentation = {
    label: 'Price List Item',
    fields: { unit: { create: false } },
  };
  // The server fetches an empty unit from the item.
  static override refills = { item: ['unit'] };
}
