import type { FiltersMap } from 'fyo/model/types';
import { StockTransferItem, transferRowFields } from './StockTransferItem';

export class ShipmentItem extends StockTransferItem {
  static override presentation = {
    label: 'Shipment Item',
    quickEditFields: transferRowFields,
  };

  // Items are Frappe-backed.
  static filters: FiltersMap = {
    item: () => ({ item_usage: ['not in', ['Purchases']], track_item: true }),
  };
}
