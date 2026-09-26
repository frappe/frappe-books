import { DocValueMap } from 'fyo/core/types';
import { ReturnDocItem } from './inventory/types';

type ReturnBalances = Record<string, ReturnDocItem>;

/** Negated rows of `items` limited to the server's return balance. */
export function getReturnItems(
  items: DocValueMap[],
  balances: ReturnBalances | undefined
): DocValueMap[] {
  const returnable = getReturnableQuantities(items, balances);
  const returnItems: DocValueMap[] = [];
  for (const item of items) {
    const key = getReturnKey(item);
    const quantity = Math.min(item.quantity as number, returnable[key]);
    returnable[key] -= quantity;
    if (quantity <= 0) {
      continue;
    }

    const transferQuantity =
      quantity / ((item.unitConversionFactor as number) || 1);
    returnItems.push({
      ...item,
      name: undefined,
      quantity: -quantity,
      transferQuantity: -transferQuantity,
      qty: -transferQuantity,
      serialNumber: getReturnableSerialNumbers(item, balances),
    });
  }

  return returnItems;
}

function getReturnableQuantities(
  items: DocValueMap[],
  balances: ReturnBalances | undefined
): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const item of items) {
    const key = getReturnKey(item);
    quantities[key] = balances
      ? getBalanceQuantity(item, balances)
      : (quantities[key] ?? 0) + (item.quantity as number);
  }

  return quantities;
}

function getBalanceQuantity(
  { item, batch }: DocValueMap,
  balances: ReturnBalances
): number {
  const balance = balances[item as string];
  const batches = balance?.batches ?? {};
  if (batch) {
    return -(batches[batch as string]?.quantity ?? 0);
  }

  const batchedQuantity = Object.values(batches).reduce(
    (total, { quantity }) => total + quantity,
    0
  );
  return -((balance?.quantity ?? 0) - batchedQuantity);
}

function getReturnableSerialNumbers(
  { item, serialNumber }: DocValueMap,
  balances: ReturnBalances | undefined
): string | undefined {
  if (!balances || typeof serialNumber !== 'string') {
    return serialNumber as string | undefined;
  }

  const returnable = balances[item as string]?.serialNumbers ?? [];
  return serialNumber
    .split('\n')
    .map((serial) => serial.trim())
    .filter((serial) => returnable.includes(serial))
    .join('\n');
}

function getReturnKey({ item, batch }: DocValueMap): string {
  return `${item as string}\u0000${(batch as string | undefined) ?? ''}`;
}
