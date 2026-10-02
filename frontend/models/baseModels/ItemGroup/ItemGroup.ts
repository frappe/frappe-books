import type { Fyo } from 'fyo';
import { HiddenMap, ListViewSettings } from 'fyo/model/types';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { FrappeDoc } from 'src/frappe/document';

/** Books Item Group, served by Frappe. Items fetch its HSN code on the server. */
export class ItemGroup extends FrappeDoc {
  static override doctype = 'Books Item Group';
  static override presentation = {
    label: 'Item Group',
    nameField: { label: 'Name', placeholder: 'Name' },
    quickEditFields: ['tax', 'hsn_code'],
  };

  hidden: HiddenMap = {
    hsn_code: () => isHsnCodeHidden(this.fyo),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      columns: ['name', 'tax', ...(isHsnCodeHidden(fyo) ? [] : ['hsn_code'])],
    };
  }
}
