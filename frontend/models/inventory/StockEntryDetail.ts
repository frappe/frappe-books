import type { FiltersMap, HiddenMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import {
  getStockEntryRowRefills,
  getStockRowHiddenMap,
  getTransferUnitFilter,
} from './stockRows';

/** A Books Stock Entry row. The server fills its units, rate and warehouses. */
export class StockEntryDetail extends FrappeDoc {
  static override presentation = {
    label: 'Stock Entry Detail',
    fields: { uom: { create: false } },
    quickEditFields: [
      'item_code',
      's_warehouse',
      't_warehouse',
      'qty',
      'uom',
      'batch_no',
      'serial_no',
      'transfer_qty',
      'stock_uom',
      'conversion_factor',
      'basic_rate',
      'amount',
    ],
  };
  static override refills = getStockEntryRowRefills();

  override hidden: HiddenMap = getStockRowHiddenMap(this, 'transfer_qty');

  static filters: FiltersMap = {
    item_code: () => [['is_stock_item', '=', 1]],
    uom: getTransferUnitFilter,
    batch_no: (doc) => [['item', '=', doc.item_code]],
  };

  static createFilters: FiltersMap = {
    // A new batch is of the row's item, whatever the search lists.
    batch_no: (doc) => [['item', '=', doc.item_code]],
    item_code: () => [
      ['is_stock_item', '=', 1],
      ['item_type', '=', 'Product'],
    ],
  };
}
