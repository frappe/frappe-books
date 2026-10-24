import type { FiltersMap, HiddenMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import {
  getStockRowHiddenMap,
  getTransferUnitFilter,
  stockRowRefills,
} from './stockRows';

/** A Books Stock Entry row. The server fills its units, rate and locations. */
export class StockEntryItem extends FrappeDoc {
  static override presentation = {
    label: 'Stock Entry Item',
    fields: { transfer_unit: { create: false } },
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
  static override refills = stockRowRefills;

  override hidden: HiddenMap = getStockRowHiddenMap(this);

  static filters: FiltersMap = {
    item: () => [['is_stock_item', '=', 1]],
    transfer_unit: getTransferUnitFilter,
    batch: (doc) => [['item', '=', doc.item]],
  };

  static createFilters: FiltersMap = {
    item: () => [
      ['is_stock_item', '=', 1],
      ['item_type', '=', 'Product'],
    ],
  };
}
