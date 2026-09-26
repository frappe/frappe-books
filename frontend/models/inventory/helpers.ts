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
  if (!quantity || quantity <= 0) {
    return '';
  }

  const hasSerialNumber = await fyo.getValue(
    ModelNameEnum.Item,
    item,
    'hasSerialNumber'
  );

  if (!hasSerialNumber) {
    return '';
  }

  const serialNumberSeries = await fyo.getValue(
    ModelNameEnum.Item,
    item,
    'serialNumberSeries'
  );

  if (!serialNumberSeries || typeof serialNumberSeries !== 'string') {
    return '';
  }

  const seriesName = serialNumberSeries.trim();
  if (!seriesName) {
    return '';
  }

  const exists = await fyo.db.exists(
    ModelNameEnum.SerialNumberSeries,
    seriesName
  );

  if (!exists) {
    return '';
  }

  const seriesDoc = (await fyo.doc.getDoc(
    ModelNameEnum.SerialNumberSeries,
    seriesName
  )) as SerialNumberSeries;

  const serialNumbers: string[] = [];
  const padZeros = seriesDoc.padZeros as number;

  let currentValue = await getHighestSerialNumberForItem(fyo, item, seriesName);

  if (currentValue === null) {
    currentValue =
      ((seriesDoc.current as number) || (seriesDoc.start as number)) - 1;
  }

  while (serialNumbers.length < quantity) {
    currentValue++;

    const serialNumber = getPaddedName(seriesName, currentValue, padZeros);

    const snExists = await fyo.db.exists(
      ModelNameEnum.SerialNumber,
      serialNumber
    );

    if (!snExists) {
      serialNumbers.push(serialNumber);
    }
  }

  if (serialNumbers.length > 0) {
    await seriesDoc.set('current', currentValue);
    await seriesDoc.sync();
  }

  const result = serialNumbers.join('\n');
  return result;
}

async function getHighestSerialNumberForItem(
  fyo: Fyo,
  item: string,
  seriesName: string
): Promise<number | null> {
  const serialNumbers = await fyo.db.getAllRaw(ModelNameEnum.SerialNumber, {
    filters: { item: item },
    fields: ['name'],
  });

  if (!serialNumbers || serialNumbers.length === 0) {
    return null;
  }

  let highestValue = -1;

  for (const sn of serialNumbers) {
    const name = sn.name as string;

    if (name.startsWith(seriesName)) {
      const numericPart = name.substring(seriesName.length);
      const value = parseInt(numericPart, 10);

      if (!isNaN(value) && value > highestValue) {
        highestValue = value;
      }
    }
  }

  return highestValue >= 0 ? highestValue : null;
}

function getPaddedName(prefix: string, next: number, padZeros: number): string {
  return prefix + next.toString().padStart(padZeros ?? 4, '0');
}

export async function getExistingActiveSerialNumbersForItem(
  fyo: Fyo,
  item: string,
  quantity: number
): Promise<string> {
  if (!quantity || quantity <= 0) {
    return '';
  }

  const hasSerialNumber = await fyo.getValue(
    ModelNameEnum.Item,
    item,
    'hasSerialNumber'
  );

  if (!hasSerialNumber) {
    return '';
  }

  const stockLedgerEntries = (await fyo.db.getAllRaw(
    ModelNameEnum.StockLedgerEntry,
    {
      fields: ['serialNumber', 'date', 'quantity'],
      filters: {
        item: item,
        serialNumber: ['!=', ''],
      },
      orderBy: ['date', 'created', 'name'],
      order: 'asc',
    }
  )) as {
    serialNumber?: string;
    serial_number?: string;
    date: string;
    quantity: number;
  }[];

  if (!stockLedgerEntries || stockLedgerEntries.length === 0) {
    return '';
  }

  const serialNumberStockMap: Record<string, number> = {};

  for (const entry of stockLedgerEntries) {
    const sn = (entry.serialNumber ?? entry.serial_number ?? '').trim();
    if (!sn) continue;

    serialNumberStockMap[sn] = (serialNumberStockMap[sn] || 0) + entry.quantity;
  }

  const availableSerialNumbers: string[] = [];
  const seenSerialNumbers = new Set<string>();

  for (const entry of stockLedgerEntries) {
    const sn = (entry.serialNumber ?? entry.serial_number ?? '').trim();
    if (!sn) continue;
    if (seenSerialNumbers.has(sn)) continue;

    if ((serialNumberStockMap[sn] || 0) > 0) {
      availableSerialNumbers.push(sn);
      seenSerialNumbers.add(sn);

      if (availableSerialNumbers.length >= quantity) {
        break;
      }
    }
  }

  if (availableSerialNumbers.length === 0) {
    return '';
  }

  const selectedSerialNumbers = availableSerialNumbers.slice(0, quantity);

  return selectedSerialNumbers.join('\n');
}

export async function getSuggestedBatchName(
  fyo: Fyo,
  itemName: string
): Promise<string | undefined> {
  try {
    const batchSeries = await fyo.getValue(
      ModelNameEnum.Item,
      itemName,
      'batchSeries'
    );

    if (!batchSeries) {
      return undefined;
    }

    const seriesName = (batchSeries as string).trim();

    const seriesExists = await fyo.db.exists('BatchSeries', seriesName);

    if (!seriesExists) {
      await fyo.doc
        .getNewDoc('BatchSeries', {
          name: seriesName,
          start: 1001,
          padZeros: 4,
          current: 1001,
        })
        .sync();
    }

    const batchSeriesDoc = (await fyo.doc.getDoc(
      'BatchSeries',
      seriesName
    )) as BatchSeries;

    const padZeros = (batchSeriesDoc.padZeros as number) ?? 4;

    const existingBatches = (await fyo.db.getAllRaw(ModelNameEnum.Batch, {
      fields: ['name'],
      filters: { item: itemName },
    })) as { name: string }[];

    let nextNumber: number;

    if (existingBatches && existingBatches.length > 0) {
      let highestNumber = -1;

      for (const batch of existingBatches) {
        const batchName = batch.name;
        // Extract numeric part from batch name (handles names like "com-1001")
        const numericPart = batchName.replace(seriesName, '');
        const num = parseInt(numericPart, 10);

        if (!isNaN(num) && num > highestNumber) {
          highestNumber = num;
        }
      }

      if (highestNumber >= 0) {
        nextNumber = highestNumber + 1;
      } else {
        nextNumber = (batchSeriesDoc.start as number) ?? 1001;
      }
    } else {
      nextNumber = (batchSeriesDoc.start as number) ?? 1001;
    }

    const batchName = `${seriesName}${nextNumber
      .toString()
      .padStart(padZeros, '0')}`;

    return batchName;
  } catch (error) {
    return undefined;
  }
}

export async function createBatch(
  fyo: Fyo,
  itemName: string,
  batchName: string
): Promise<boolean> {
  try {
    const batchExists = await fyo.db.exists(ModelNameEnum.Batch, batchName);
    if (batchExists) {
      return true;
    }

    const batchDoc = fyo.doc.getNewDoc('Batch', {
      name: batchName,
      item: itemName,
    });

    await batchDoc.sync();

    const batchSeries = await fyo.getValue(
      ModelNameEnum.Item,
      itemName,
      'batchSeries'
    );

    if (batchSeries) {
      const seriesName = (batchSeries as string).trim();
      const batchSeriesDoc = (await fyo.doc.getDoc(
        'BatchSeries',
        seriesName
      )) as BatchSeries;

      const num = parseInt(batchName, 10);
      if (!isNaN(num)) {
        await batchSeriesDoc.set('current', num);
        await batchSeriesDoc.sync();
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

export async function generateBatchForItem(
  fyo: Fyo,
  itemName: string
): Promise<string | undefined> {
  const batchName = await getSuggestedBatchName(fyo, itemName);
  if (!batchName) {
    return undefined;
  }

  const success = await createBatch(fyo, itemName, batchName);
  return success ? batchName : undefined;
}
