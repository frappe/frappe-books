import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Item Group, served by Frappe. Items fetch its HSN code on the server. */
export class ItemGroup extends FrappeDoc {
  static override doctype = 'Books Item Group';
  static override presentation = {
    label: 'Item Group',
    nameField: { label: 'Name', placeholder: 'Name' },
    quickEditFields: ['tax', 'hsn_code'],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'tax', 'hsn_code'],
    };
  }
}
