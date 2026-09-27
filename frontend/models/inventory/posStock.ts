import { Fyo, t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { ItemQtyMap } from 'src/components/POS/types';

/** The location a POS sale ships from, as the server picks it. */
export async function getPOSInventory(fyo: Fyo): Promise<string | undefined> {
  return (
    (await fyo.db.getStockLocation(ModelNameEnum.SalesInvoice, true)) ??
    undefined
  );
}

export async function getPOSBatchQuantity(
  fyo: Fyo,
  item: string,
  batch?: string
): Promise<number> {
  const inventory = await getPOSInventory(fyo);
  if (!batch || !inventory) {
    return 0;
  }

  return (
    (await fyo.db.getStockQuantity(
      item,
      inventory,
      undefined,
      undefined,
      batch
    )) ?? 0
  );
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
