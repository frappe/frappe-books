import type { FiltersMap } from 'fyo/model/types';
import {
  StockTransferItem,
  transferRowFields,
  transferRowFilters,
  transferRowLinks,
} from './StockTransferItem';

export class ShipmentItem extends StockTransferItem {
  static override presentation = {
    label: 'Shipment Item',
    quickEditFields: transferRowFields,
    fields: transferRowLinks,
  };

  // Items are Frappe-backed.
  static filters: FiltersMap = {
    ...transferRowFilters,
    item: () => [
      ['item_usage', 'not in', ['Purchases']],
      ['track_item', '=', 1],
    ],
  };
}
