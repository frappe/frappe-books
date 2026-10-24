import type { Feature } from 'fyo/utils/features';
import type { FrappeDoc } from 'src/frappe/document';
import type { HiddenMap } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { getItemUnits } from './units';

/** The field a stock row keeps its quantity in the stock unit in: ERPNext's. */
export type StockQtyField = 'stock_qty' | 'transfer_qty';

/** Fields a stock row takes from its item and quantities again when the user edits them. */
function getStockRowRefills(
  stockQtyField: StockQtyField
): Record<string, string[]> {
  return {
    item_code: [
      'item_name',
      'stock_uom',
      'uom',
      'conversion_factor',
      stockQtyField,
      'batch_no',
      'serial_no',
    ],
    qty: [stockQtyField],
    [stockQtyField]: ['qty'],
    uom: ['conversion_factor', stockQtyField],
  };
}

/** A delivery note or receipt row's refills; its rate is per row unit, so a new unit prices it again. */
export function getTransferRowRefills(): Record<string, string[]> {
  const refills = getStockRowRefills('stock_qty');
  return {
    ...refills,
    item_code: ['rate', 'description', 'gst_hsn_code', ...refills.item_code],
    uom: [...refills.uom, 'rate'],
  };
}

/** A stock entry row's refills; its basic_rate is per stock unit, so a new unit leaves it. */
export function getStockEntryRowRefills(): Record<string, string[]> {
  const refills = getStockRowRefills('transfer_qty');
  return {
    ...refills,
    item_code: ['basic_rate', ...refills.item_code],
  };
}

/** Stock row fields of the inventory features turned off. */
export function getStockRowHiddenMap(
  doc: FrappeDoc,
  stockQtyField: StockQtyField
): HiddenMap {
  const isOff = (feature: Feature) => () => !doc.fyo.isFeatureOn(feature);
  return {
    batch_no: isOff('enable_batches'),
    serial_no: isOff('enable_serial_number'),
    uom: isOff('enable_uom_conversions'),
    [stockQtyField]: isOff('enable_uom_conversions'),
    conversion_factor: isOff('enable_uom_conversions'),
  };
}

/** The units a row can move its item in: the stock unit and the item's conversions. */
export async function getTransferUnitFilter(doc: FrappeDoc): Promise<Filter[]> {
  const { unit, factors } = await getItemUnits(doc.item_code as string);
  const units = [unit, ...Object.keys(factors)];
  return [['name', 'in', units.filter(Boolean)]];
}
