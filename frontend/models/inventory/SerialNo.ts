import { ListViewSettings } from 'fyo/model/types';
import { getSerialNumberStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

/** Books Serial No, served by Frappe and named by its Serial No. Stock moves set its status on the server. */
export class SerialNo extends FrappeDoc {
  static override doctype = 'Books Serial No';
  static override presentation = {
    label: 'Serial No',
    quickEditFields: ['item_code', 'description'],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getSerialNumberStatusColumn(),
        'item_code',
        'description',
      ],
    };
  }
}
