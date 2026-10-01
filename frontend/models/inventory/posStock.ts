import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { ItemQtyMap } from 'src/components/POS/types';
import { safeParseFloat } from 'utils/index';
import {
  getBatchQuantity,
  getStockLocation,
  getStockQuantities,
} from './availability';
import { getSaleShortfalls, type ItemQuantity } from './insufficientStock';

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

/** Checks, on the server, that the POS location has what the rows need of each tracked item, or batch. */
export async function validatePOSStock(rows: ItemQuantity[]) {
  const [shortfall] = await getSaleShortfalls(rows, true);
  if (!shortfall) {
    return;
  }

  const { item, batch, quantity: missing } = shortfall;
  const required = rows
    .filter((row) => row.item === item && (row.batch || '') === (batch || ''))
    .reduce((total, row) => safeParseFloat(total + (row.quantity ?? 0)), 0);
  const available = safeParseFloat(required - (missing ?? 0));
  const inventory = await getPOSInventory();
  const locationText = inventory ? ' ' + t`in ${inventory}` : '';
  const batchText = batch ? ' ' + t`for batch ${batch}` : '';
  throw new ValidationError(
    t`Insufficient stock for ${item!}${locationText}${batchText}. Available: ${available}; required: ${required}.`
  );
}
