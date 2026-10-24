import type { Fyo } from 'fyo';
import { LinkedRecords, ListViewSettings } from 'fyo/model/types';
import { getItemPrices } from 'models/baseModels/ItemPrice/ItemPrice';
import {
  getIsDocEnabledColumn,
  getPriceListStatusColumn,
} from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

/** Books Price List, served by Frappe. Its preview fills the company currency; its prices are Item Prices. */
export class PriceList extends FrappeDoc {
  static override doctype = 'Books Price List';
  static override presentation = { label: 'Price List' };
  static override previewMethod = 'preview';

  static override getLinkedRecords(fyo: Fyo): LinkedRecords | undefined {
    return getItemPrices(
      fyo,
      'price_list',
      fyo.t`No item prices in this price list`
    );
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getIsDocEnabledColumn('enabled'),
        getPriceListStatusColumn(),
      ],
    };
  }
}
