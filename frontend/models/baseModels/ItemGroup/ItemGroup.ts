import type { Fyo } from 'fyo';
import { HiddenMap, ListViewSettings } from 'fyo/model/types';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { FrappeDoc } from 'src/frappe/document';
import { ItemTax } from '../Item/ItemTax';

/** Books Item Group, served by Frappe. Items fetch its HSN code on the server. */
export class ItemGroup extends FrappeDoc {
  static override doctype = 'Books Item Group';
  static override presentation = {
    label: 'Item Group',
    quickEditFields: ['taxes', 'gst_hsn_code'],
  };
  static override rowModels = { taxes: ItemTax };

  hidden: HiddenMap = {
    gst_hsn_code: () => isHsnCodeHidden(this.fyo),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      columns: ['name', ...(isHsnCodeHidden(fyo) ? [] : ['gst_hsn_code'])],
    };
  }
}
