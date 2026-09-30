import type { FiltersMap } from 'fyo/model/types';
import { StockTransferItem, transferRowFields } from './StockTransferItem';

export class PurchaseReceiptItem extends StockTransferItem {
  static override presentation = {
    label: 'Purchase Receipt Item',
    quickEditFields: transferRowFields,
  };

  // Items are Frappe-backed.
  static filters: FiltersMap = {
    item: () => ({ item_usage: ['not in', ['Sales']], track_item: true }),
  };
}
