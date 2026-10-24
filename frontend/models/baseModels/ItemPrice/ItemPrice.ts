import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Item Price, served by Frappe: an item's rate in a price list, per unit and dates. */
export class ItemPrice extends FrappeDoc {
  static override doctype = 'Books Item Price';
  static override presentation = {
    label: 'Item Price',
    fields: { uom: { create: false } },
  };
  static override previewMethod = 'preview';
  // The server fetches an empty unit from the item.
  static override refills = { item_code: ['uom'] };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'item_code',
        'price_list',
        'uom',
        'price_list_rate',
        'valid_from',
        'valid_upto',
      ],
    };
  }
}
