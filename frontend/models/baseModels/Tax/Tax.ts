import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Tax, a tax template served by Frappe with its Books Tax Detail rows. */
export class Tax extends FrappeDoc {
  static override doctype = 'Books Tax';
  static override presentation = {
    label: 'Tax Template',
    nameField: { label: 'Name' },
    quickEditFields: ['details'],
  };

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name'] };
  }
}
