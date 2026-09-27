import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

/** The row's serial numbers resized to `quantity`, topped up with new ones from the item's series. */
export async function getSerialNumbersForQuantity(
  fyo: Fyo,
  item: string,
  serialNumber: string | undefined,
  quantity: number
): Promise<string> {
  if (!(await fyo.getValue(ModelNameEnum.Item, item, 'hasSerialNumber'))) {
    return '';
  }

  const current = (serialNumber ?? '')
    .split('\n')
    .map((serial) => serial.trim())
    .filter(Boolean);
  if (current.length >= quantity) {
    return current.slice(0, quantity).join('\n');
  }

  const added = await fyo.db.getNewSeriesNames(
    ModelNameEnum.SerialNumber,
    item,
    quantity - current.length
  );
  return [...current, ...added].join('\n');
}

/** The item's earliest received serial numbers that are in stock. */
export async function getExistingActiveSerialNumbersForItem(
  fyo: Fyo,
  item: string,
  quantity: number
): Promise<string> {
  if (
    !quantity ||
    quantity <= 0 ||
    !(await fyo.getValue(ModelNameEnum.Item, item, 'hasSerialNumber'))
  ) {
    return '';
  }

  const serialNumbers = await fyo.db.getAllRaw(ModelNameEnum.SerialNumber, {
    fields: ['name'],
    filters: { item, status: 'Active' },
    orderBy: 'created',
    order: 'asc',
    limit: quantity,
  });
  return serialNumbers.map((row) => row.name as string).join('\n');
}

/** A new batch name from the item's batch series, reserved on the server. */
export async function getSuggestedBatchName(
  fyo: Fyo,
  item: string
): Promise<string | undefined> {
  if (!(await fyo.getValue(ModelNameEnum.Item, item, 'hasBatch'))) {
    return undefined;
  }

  const [batch] = await fyo.db.getNewSeriesNames(ModelNameEnum.Batch, item, 1);
  return batch;
}
