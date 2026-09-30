import type { Doc } from 'fyo/model/doc';
import type { HiddenMap } from 'fyo/model/types';
import { getDocuments } from 'src/frappe/api';

/** Fields a stock row takes from its item and quantities again when the user edits them. */
export const stockRowDerivedFields: Record<string, string[]> = {
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
export function getStockRowHiddenMap(doc: Doc): HiddenMap {
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
export async function getTransferUnitFilter(doc: Doc) {
  const [item] = await getDocuments('Books Item', {
    fields: ['unit', { uom_conversions: ['uom'] }],
    filters: [['name', '=', doc.item as string]],
  });
  const conversions = (item?.uom_conversions ?? []) as { uom: string }[];
  const units = [item?.unit, ...conversions.map(({ uom }) => uom)];
  return { name: ['in', units.filter(Boolean) as string[]] };
}
