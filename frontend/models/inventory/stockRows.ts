import type { FrappeDoc } from 'src/frappe/document';
import type { HiddenMap } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { getItemUnits } from './units';

/** Fields a stock row takes from its item and quantities again when the user edits them. */
export const stockRowRefills: Record<string, string[]> = {
  item: [
    'rate',
    'unit',
    'transfer_unit',
    'unit_conversion_factor',
    'transfer_quantity',
    'batch',
    'serial_number',
  ],
  quantity: ['transfer_quantity'],
  transfer_quantity: ['quantity'],
  transfer_unit: ['unit_conversion_factor', 'quantity'],
};

/** Stock row fields of the inventory features turned off. */
export function getStockRowHiddenMap(doc: FrappeDoc): HiddenMap {
  const settings = () => doc.fyo.singles.InventorySettings;
  return {
    batch: () => !settings()?.enable_batches,
    serial_number: () => !settings()?.enable_serial_number,
    transfer_unit: () => !settings()?.enable_uom_conversions,
    transfer_quantity: () => !settings()?.enable_uom_conversions,
    unit_conversion_factor: () => !settings()?.enable_uom_conversions,
  };
}

/** The units a row can move its item in: the stock unit and the item's conversions. */
export async function getTransferUnitFilter(doc: FrappeDoc): Promise<Filter[]> {
  const { unit, factors } = await getItemUnits(doc.item as string);
  const units = [unit, ...Object.keys(factors)];
  return [['name', 'in', units.filter(Boolean)]];
}
