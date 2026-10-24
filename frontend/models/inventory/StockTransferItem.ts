import type { FiltersMap, HiddenMap } from 'fyo/model/types';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import {
  getStockRowHiddenMap,
  getTransferRowRefills,
  getTransferUnitFilter,
} from './stockRows';

/** Links of a shipment or purchase receipt row that offer no Create, as before. */
export const transferRowLinks = withoutCreate(['item_code', 'uom', 'batch_no']);

/** The batches, units and items a shipment or purchase receipt row offers: its item's, and stock items. */
export const transferRowFilters: FiltersMap = {
  item_code: () => [['is_stock_item', '=', 1]],
  batch_no: (doc) => [['item', '=', doc.item_code]],
  uom: getTransferUnitFilter,
};

/** The fields a shipment or purchase receipt row editor shows, with the invoice link field of the row. */
export function getTransferRowFields(invoiceField: string): string[] {
  return [
    'item_code',
    'qty',
    'uom',
    'batch_no',
    'serial_no',
    'stock_qty',
    'stock_uom',
    'conversion_factor',
    'description',
    'gst_hsn_code',
    'warehouse',
    'rate',
    'amount',
    'discount_amount',
    'discount_percentage',
    invoiceField,
  ];
}

/** A shipment or purchase receipt row. The server fills its units, rate, warehouse and serial numbers. */
export abstract class StockTransferItem extends FrappeDoc {
  static override refills = getTransferRowRefills();
  static override filters = transferRowFilters;
  /** The row's link to the invoice row it was made from. */
  static invoiceField: string;

  override hidden: HiddenMap = {
    ...getStockRowHiddenMap(this, 'stock_qty'),
    gst_hsn_code: () => isHsnCodeHidden(this.fyo),
    [this.invoiceField]: () => !this.get(this.invoiceField),
  };

  get invoiceField(): string {
    return (this.constructor as typeof StockTransferItem).invoiceField;
  }
}
