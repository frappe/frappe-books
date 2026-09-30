import { ListViewSettings } from 'fyo/model/types';
import {
  getIsDocEnabledColumn,
  getPriceListStatusColumn,
} from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';
import { PriceListItem } from './PriceListItem';

/** Books Price List, served by Frappe. Its preview fills each row's unit from the item. */
export class PriceList extends FrappeDoc {
  static override doctype = 'Books Price List';
  static override presentation = {
    label: 'Price List',
    nameField: { label: 'Name' },
  };
  static override previewMethod = 'preview';
  static override rowModels = { price_list_item: PriceListItem };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getIsDocEnabledColumn(), getPriceListStatusColumn()],
    };
  }
}
