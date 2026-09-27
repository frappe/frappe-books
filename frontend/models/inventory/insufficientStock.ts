import type { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { ModelNameEnum } from 'models/types';

type ItemQuantity = { item: string; batch?: string; quantity: number };

/** Tracked items short of stock on the invoice date where the server ships them from. */
export async function getInsufficientItems(
  invoice: SalesInvoice
): Promise<ItemQuantity[]> {
  const date = invoice.date!.toISOString();
  const location = await invoice.fyo.db.getStockLocation(
    invoice.schemaName,
    !!invoice.isPOS
  );
  const shortfalls = await Promise.all(
    (await getTrackedItemQuantities(invoice)).map(async (row) => {
      const stock = await invoice.fyo.db.getStockQuantity(
        row.item,
        location ?? undefined,
        undefined,
        date,
        row.batch
      );
      return { ...row, quantity: row.quantity - (stock ?? 0) };
    })
  );

  return shortfalls.filter(({ quantity }) => quantity > 0);
}

/** Quantities of stock-tracked items summed per item and batch. */
async function getTrackedItemQuantities(
  invoice: SalesInvoice
): Promise<ItemQuantity[]> {
  const quantities = new Map<string, ItemQuantity>();
  for (const { item, batch, quantity } of invoice.items ?? []) {
    if (!item || typeof quantity !== 'number') {
      continue;
    }

    const isTracked = await invoice.fyo.getValue(
      ModelNameEnum.Item,
      item,
      'trackItem'
    );
    if (!isTracked) {
      continue;
    }

    const key = `${item}\u0000${batch ?? ''}`;
    const row = quantities.get(key) ?? { item, batch, quantity: 0 };
    row.quantity += quantity;
    quantities.set(key, row);
  }

  return [...quantities.values()];
}
