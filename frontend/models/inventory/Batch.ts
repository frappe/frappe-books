import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Batch, served by Frappe. */
export class Batch extends FrappeDoc {
  static override doctype = 'Books Batch';
  static override presentation = {
    label: 'Batch',
    nameField: { label: 'Batch' },
    quickEditFields: ['item', 'expiry_date', 'manufacture_date'],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'expiry_date', 'manufacture_date'],
    };
  }
}
