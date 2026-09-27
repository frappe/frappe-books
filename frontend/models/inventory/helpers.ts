import { Fyo } from 'fyo';
import type { Invoice } from 'models/baseModels/Invoice/Invoice';
import { ModelNameEnum } from 'models/types';
import type { StockMovement } from './StockMovement';
import type { StockTransfer } from './StockTransfer';

const batchReceivingSchemas: string[] = [
  ModelNameEnum.PurchaseInvoice,
  ModelNameEnum.PurchaseReceipt,
  ModelNameEnum.StockMovement,
];

/**
 * Inserts the new batches that receiving rows name, before the document saves.
 * The server checks links before any document hook, so it cannot add them.
 */
export async function createMissingBatches(
  doc: StockMovement | StockTransfer | Invoice
) {
  if (!batchReceivingSchemas.includes(doc.schemaName)) {
    return;
  }

  for (const { item, batch } of doc.items ?? []) {
    if (
      item &&
      batch &&
      (await doc.fyo.getValue(ModelNameEnum.Item, item, 'hasBatch'))
    ) {
      await createBatch(doc.fyo, item, batch);
    }
  }
}

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

export async function createBatch(fyo: Fyo, item: string, batch: string) {
  if (await fyo.db.exists(ModelNameEnum.Batch, batch)) {
    return;
  }

  await fyo.doc.getNewDoc(ModelNameEnum.Batch, { name: batch, item }).sync();
}
