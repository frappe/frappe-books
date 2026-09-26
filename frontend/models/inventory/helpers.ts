import { Fyo } from 'fyo';
import type { Invoice } from 'models/baseModels/Invoice/Invoice';
import { ModelNameEnum } from 'models/types';
import type { StockMovement } from './StockMovement';
import type { StockTransfer } from './StockTransfer';
import BatchSeries from 'fyo/models/BatchSeries';
import SerialNumberSeries from 'fyo/models/SerialNumberSeries';

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

export async function generateSerialNumbersForItem(
  fyo: Fyo,
  item: string,
  quantity: number
): Promise<string> {
  const series =
    quantity > 0 ? await getSerialNumberSeries(fyo, item) : undefined;
  if (!series) {
    return '';
  }

  const prefix = series.name as string;
  let current =
    (await getHighestNumber(fyo, ModelNameEnum.SerialNumber, item, prefix)) ??
    ((series.current as number) || (series.start as number)) - 1;
  const serialNumbers: string[] = [];
  while (serialNumbers.length < quantity) {
    current++;
    const name = getPaddedName(prefix, current, series.padZeros as number);
    if (!(await fyo.db.exists(ModelNameEnum.SerialNumber, name))) {
      serialNumbers.push(name);
    }
  }

  await series.setAndSync('current', current);
  return serialNumbers.join('\n');
}

async function getSerialNumberSeries(
  fyo: Fyo,
  item: string
): Promise<SerialNumberSeries | undefined> {
  if (!(await fyo.getValue(ModelNameEnum.Item, item, 'hasSerialNumber'))) {
    return;
  }

  const name = await getItemSeriesName(fyo, item, 'serialNumberSeries');
  if (!name || !(await fyo.db.exists(ModelNameEnum.SerialNumberSeries, name))) {
    return;
  }

  return (await fyo.doc.getDoc(
    ModelNameEnum.SerialNumberSeries,
    name
  )) as SerialNumberSeries;
}

async function getItemSeriesName(
  fyo: Fyo,
  item: string,
  fieldname: 'batchSeries' | 'serialNumberSeries'
): Promise<string | undefined> {
  const name = await fyo.getValue(ModelNameEnum.Item, item, fieldname);
  return typeof name === 'string' ? name.trim() : undefined;
}

/** Highest number after the prefix in the names of an item's batches or serial numbers. */
async function getHighestNumber(
  fyo: Fyo,
  schemaName: ModelNameEnum.Batch | ModelNameEnum.SerialNumber,
  item: string,
  prefix: string
): Promise<number | null> {
  const rows = await fyo.db.getAllRaw(schemaName, {
    fields: ['name'],
    filters: { item },
  });
  const highest = rows
    .map((row) => row.name as string)
    .filter((name) => name.startsWith(prefix))
    .map((name) => parseInt(name.substring(prefix.length), 10))
    .reduce((max, value) => (value > max ? value : max), -1);
  return highest >= 0 ? highest : null;
}

function getPaddedName(prefix: string, next: number, padZeros: number): string {
  return prefix + next.toString().padStart(padZeros ?? 4, '0');
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

export async function getSuggestedBatchName(
  fyo: Fyo,
  item: string
): Promise<string | undefined> {
  const prefix = await getItemSeriesName(fyo, item, 'batchSeries');
  if (!prefix) {
    return undefined;
  }

  const series = await getBatchSeries(fyo, prefix);
  const highest = await getHighestNumber(
    fyo,
    ModelNameEnum.Batch,
    item,
    prefix
  );
  const next =
    highest === null ? ((series.start as number) ?? 1001) : highest + 1;
  return getPaddedName(prefix, next, (series.padZeros as number) ?? 4);
}

async function getBatchSeries(fyo: Fyo, name: string): Promise<BatchSeries> {
  if (!(await fyo.db.exists(ModelNameEnum.BatchSeries, name))) {
    const values = { name, start: 1001, padZeros: 4, current: 1001 };
    await fyo.doc.getNewDoc(ModelNameEnum.BatchSeries, values).sync();
  }

  return (await fyo.doc.getDoc(ModelNameEnum.BatchSeries, name)) as BatchSeries;
}

export async function createBatch(fyo: Fyo, item: string, batch: string) {
  if (await fyo.db.exists(ModelNameEnum.Batch, batch)) {
    return;
  }

  await fyo.doc.getNewDoc(ModelNameEnum.Batch, { name: batch, item }).sync();
}
