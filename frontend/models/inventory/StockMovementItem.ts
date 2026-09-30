import type { FiltersMap, HiddenMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import {
  getStockRowHiddenMap,
  getTransferUnitFilter,
  stockRowDerivedFields,
} from './stockRows';

/** A Books Stock Movement row. The server fills its units, rate and locations. */
export class StockMovementItem extends FrappeDoc {
  static override presentation = {
    label: 'Stock Movement Item',
    quickEditFields: [
      'item',
      'from_location',
      'to_location',
      'transfer_quantity',
      'transfer_unit',
      'batch',
      'serial_number',
      'quantity',
      'unit',
      'unit_conversion_factor',
      'rate',
      'amount',
    ],
  };
  static override derivedFields = stockRowDerivedFields;

  override hidden: HiddenMap = getStockRowHiddenMap(this);

  // Items are Frappe-backed; units and batches still go through the bridge.
  static filters: FiltersMap = {
    item: () => ({ track_item: true }),
    transfer_unit: getTransferUnitFilter,
    batch: (doc) => ({ item: doc.item as string }),
  };

  static createFilters: FiltersMap = {
    item: () => ({ track_item: true, item_type: 'Product' }),
  };
}
