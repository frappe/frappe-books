import { FrappeDoc } from 'src/frappe/document';

/** A Books Price List Item row; its unit is picked, not created. */
export class PriceListItem extends FrappeDoc {
  static override presentation = {
    label: '',
    fields: { unit: { create: false } },
  };
}
