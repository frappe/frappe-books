import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { ItemQtyMap } from 'src/components/POS/types';
import {
  getBatchQuantity,
  getStockLocation,
  getStockQuantities,
} from './availability';

/** The location a POS sale ships from, as the server picks it. */
export async function getPOSInventory(): Promise<string | undefined> {
  return await getStockLocation('Books Sales Invoice', true);
}

/** Stock of each item, and of each of its batches, at the POS location. */
export async function getItemQtyMap(items?: string[]): Promise<ItemQtyMap> {
  const rows = await getStockQuantities(await getPOSInventory(), items);
  const itemQtyMap: ItemQtyMap = {};
  for (const { item, batch, quantity } of rows) {
    itemQtyMap[item] ??= { availableQty: 0 };
    itemQtyMap[item].availableQty += quantity;
    if (batch) {
      itemQtyMap[item][batch] = quantity;
    }
  }

  return itemQtyMap;
}

export async function getPOSBatchQuantity(
  item: string,
  batch?: string
): Promise<number> {
  const inventory = await getPOSInventory();
  if (!batch || !inventory) {
    return 0;
  }

  return await getBatchQuantity(item, batch, inventory);
}

export function validatePOSStock(
  item: string,
  quantity: number,
  itemQtyMap: ItemQtyMap,
  inventory?: string,
  batch?: string
) {
  const stock = itemQtyMap[item];
  const available = (batch ? stock?.[batch] : stock?.availableQty) ?? 0;
  if (quantity <= available) {
    return;
  }

  const locationText = inventory ? ' ' + t`in ${inventory}` : '';
  const batchText = batch ? ' ' + t`for batch ${batch}` : '';
  throw new ValidationError(
    t`Insufficient stock for ${item}${locationText}${batchText}. Available: ${available}; required: ${quantity}.`
  );
}
