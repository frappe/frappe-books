import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Batch, served by Frappe and named by its Batch No. */
export class Batch extends FrappeDoc {
  static override doctype = 'Books Batch';
  static override presentation = {
    label: 'Batch',
    quickEditFields: ['item', 'expiry_date', 'manufacturing_date'],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'expiry_date', 'manufacturing_date'],
    };
  }
}
