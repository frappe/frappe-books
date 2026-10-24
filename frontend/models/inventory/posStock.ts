import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { ItemQtyMap } from 'src/components/POS/types';
import type { FrappeDoc } from 'src/frappe/document';
import { isAccessoryMode } from 'src/frappe/mode';
import { getPOSProfile } from 'src/utils/posSetup';
import { safeParseFloat } from 'utils/index';
import {
  getBatchQuantity,
  getStockLocation,
  getStockQuantities,
} from './availability';
import { getSaleShortfalls, type ItemQuantity } from './insufficientStock';

/** The location a POS sale ships from: its POS Profile's warehouse in accessory mode, else as the server picks it. */
export async function getPOSInventory(
  sale?: FrappeDoc
): Promise<string | undefined> {
  if (isAccessoryMode()) {
    return (await getPOSProfile(sale))?.warehouse;
  }

  return await getStockLocation('Books Sales Invoice', true);
}

/** Stock of each item, and of each of its batches, at the POS location. */
export async function getItemQtyMap(sale?: FrappeDoc): Promise<ItemQtyMap> {
  const rows = await getStockQuantities(await getPOSInventory(sale));
  const itemQtyMap: ItemQtyMap = {};
  for (const { item_code, batch_no, actual_qty } of rows) {
    itemQtyMap[item_code] ??= { availableQty: 0 };
    itemQtyMap[item_code].availableQty += actual_qty;
    if (batch_no) {
      itemQtyMap[item_code][batch_no] = actual_qty;
    }
  }

  return itemQtyMap;
}

export async function getPOSBatchQuantity(
  item?: string,
  batch?: string,
  sale?: FrappeDoc
): Promise<number> {
  if (!item || !batch) {
    return 0;
  }

  const inventory = await getPOSInventory(sale);
  return inventory ? await getBatchQuantity(item, batch, inventory) : 0;
}

/**
 * Checks, on the server, that the POS location has what the rows need of
 * each tracked item, or batch. An item it has none of is out of stock, as
 * when it is added; the server says so first too.
 */
export async function validatePOSStock(rows: ItemQuantity[], sale?: FrappeDoc) {
  // ERPNext rows without a warehouse yet ship from the POS Profile's.
  const warehouse = isAccessoryMode() ? await getPOSInventory(sale) : undefined;
  const shortfalls = (
    await getSaleShortfalls(rows, true, undefined, warehouse)
  ).map(({ item_code, batch_no, stock_qty }) => {
    const required = getRequiredQuantity(rows, item_code!, batch_no);
    const available = safeParseFloat(required - (stock_qty ?? 0));
    return { item: item_code!, batch: batch_no, required, available };
  });
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

  const inventory = warehouse ?? (await getPOSInventory(sale));
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
    .filter(
      (row) => row.item_code === item && (row.batch_no || '') === (batch || '')
    )
    .reduce((total, row) => safeParseFloat(total + (row.stock_qty ?? 0)), 0);
}
