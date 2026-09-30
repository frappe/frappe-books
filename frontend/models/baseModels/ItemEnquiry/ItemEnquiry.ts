import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Item Enquiry, served by Frappe. POS records enquiries; the list only shows them. */
export class ItemEnquiry extends FrappeDoc {
  static override doctype = 'Books Item Enquiry';
  static override presentation = {
    label: 'Item Enquiry',
    nameField: { label: 'ID' },
    create: false,
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'item',
        'customer',
        'contact',
        'description',
        'similar_product',
      ],
    };
  }
}
