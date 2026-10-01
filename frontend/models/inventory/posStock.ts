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

/**
 * Checks, on the server, that the POS location has what the rows need of
 * each tracked item, or batch. An item it has none of is out of stock, as
 * when it is added; the server says so first too.
 */
export async function validatePOSStock(rows: ItemQuantity[]) {
  const shortfalls = (await getSaleShortfalls(rows, true)).map(
    ({ item, batch, quantity }) => {
      const required = getRequiredQuantity(rows, item!, batch);
      const available = safeParseFloat(required - (quantity ?? 0));
      return { item: item!, batch, required, available };
    }
  );
  const shortfall =
    shortfalls.find(({ batch, available }) => !batch && available <= 0) ??
    shortfalls[0];
  if (!shortfall) {
    return;
  }

  const { item, batch, required, available } = shortfall;
  if (!batch && available <= 0) {
    throw new ValidationError(getOutOfStockMessage(item));
  }

  const inventory = await getPOSInventory();
  const locationText = inventory ? ' ' + t`in ${inventory}` : '';
  const batchText = batch ? ' ' + t`for batch ${batch}` : '';
  throw new ValidationError(
    t`Insufficient stock for ${item}${locationText}${batchText}. Available: ${available}; required: ${required}.`
  );
}

export function getOutOfStockMessage(item: string): string {
  return t`Item ${item} is out of stock (quantity is zero)`;
}

/** What the rows of the item, from the batch or without one, add up to, as the server sums them. */
function getRequiredQuantity(
  rows: ItemQuantity[],
  item: string,
  batch?: string | null
): number {
  return rows
    .filter((row) => row.item === item && (row.batch || '') === (batch || ''))
    .reduce((total, row) => safeParseFloat(total + (row.quantity ?? 0)), 0);
}
