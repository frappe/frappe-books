import { ListViewSettings } from 'fyo/model/types';
import { getSerialNumberStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

/** Books Serial Number, served by Frappe. Stock moves set its status on the server. */
export class SerialNumber extends FrappeDoc {
  static override doctype = 'Books Serial Number';
  static override presentation = {
    label: 'Serial Number',
    nameField: { label: 'Serial Number' },
    quickEditFields: ['item', 'description'],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getSerialNumberStatusColumn(),
        'item',
        'description',
      ],
    };
  }
}
