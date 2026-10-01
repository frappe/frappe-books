import { call } from 'src/web/api';

const AVAILABILITY = 'frappe_books.inventory.availability';

/** Stock of an item, or of one of its batches, as the server sums its ledger. */
export type StockQuantity = {
  item: string;
  batch?: string | null;
  quantity: number;
};

/** Where an invoice of the doctype moves its stock, as its stock transfer would. */
export async function getStockLocation(
  doctype: string,
  isPOS = false
): Promise<string | undefined> {
  const location = await call<string | null>(
    `${AVAILABILITY}.get_stock_location`,
    { doctype, is_pos: isPOS }
  );
  return location ?? undefined;
}

/** The stock of each item and batch, at the location when given. */
export async function getStockQuantities(
  location?: string,
  items?: string[]
): Promise<StockQuantity[]> {
  return await call<StockQuantity[]>(`${AVAILABILITY}.get_stock_quantities`, {
    location,
    items,
  });
}

/** The stock of an item's batch at the location. */
export async function getBatchQuantity(
  item: string,
  batch: string,
  location?: string
): Promise<number> {
  const rows = await getStockQuantities(location, [item]);
  return rows.find((row) => row.batch === batch)?.quantity ?? 0;
}
