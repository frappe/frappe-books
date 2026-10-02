import type { FiltersMap } from 'fyo/model/types';
import {
  StockTransferItem,
  transferRowFields,
  transferRowFilters,
  transferRowLinks,
} from './StockTransferItem';

export class PurchaseReceiptItem extends StockTransferItem {
  static override presentation = {
    label: 'Purchase Receipt Item',
    quickEditFields: transferRowFields,
    fields: transferRowLinks,
  };

  // Items are Frappe-backed.
  static filters: FiltersMap = {
    ...transferRowFilters,
    item: () => [
      ['item_usage', 'not in', ['Sales']],
      ['track_item', '=', 1],
    ],
  };
}
