import { FrappeDoc } from 'src/frappe/document';

/** Books Uom, served by Frappe. */
export class UOM extends FrappeDoc {
  static override doctype = 'Books Uom';
  static override presentation = {
    label: 'UOM',
    nameField: { label: 'UOM', placeholder: 'Item Name' },
    quickEditFields: ['is_whole'],
  };
}
