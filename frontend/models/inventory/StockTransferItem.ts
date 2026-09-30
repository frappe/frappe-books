import type { HiddenMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { getStockRowHiddenMap, stockRowDerivedFields } from './stockRows';

/** The fields a shipment or purchase receipt row editor shows. */
export const transferRowFields = [
  'item',
  'transfer_quantity',
  'transfer_unit',
  'batch',
  'serial_number',
  'quantity',
  'unit',
  'unit_conversion_factor',
  'description',
  'hsn_code',
  'location',
  'rate',
  'amount',
  'item_discount_amount',
  'item_discount_percent',
];

/** A shipment or purchase receipt row. The server fills its units, rate, location and serial numbers. */
export abstract class StockTransferItem extends FrappeDoc {
  static override derivedFields = {
    ...stockRowDerivedFields,
    item: [...stockRowDerivedFields.item, 'description', 'hsn_code'],
  };

  override hidden: HiddenMap = getStockRowHiddenMap(this);
}
