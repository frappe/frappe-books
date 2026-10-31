import type { Filter } from 'src/frappe/api';
import { call } from 'src/web/api';

const AVAILABILITY = 'frappe_books.inventory.availability';

/** Stock of an item, or of one of its batches, as the server sums its ledger. */
export type StockQuantity = {
  item_code: string;
  batch_no?: string | null;
  actual_qty: number;
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

/** The stock of each item and batch, as the ledger sums it, at the location when given. */
export async function getStockQuantities(
  location?: string,
  items?: string[]
): Promise<StockQuantity[]> {
  // ERPNext keeps a cancelled entry and its reversal; Books keeps neither.
  const filters: Filter[] = [['is_cancelled', '=', 0]];
  if (location) {
    filters.push(['warehouse', '=', location]);
  }

  if (items?.length) {
    filters.push(['item_code', 'in', items]);
  }

  return await call<StockQuantity[]>('frappe.client.get_list', {
    doctype: 'Books Stock Ledger Entry',
    fields: ['item_code', 'batch_no', { SUM: 'actual_qty', as: 'actual_qty' }],
    filters,
    group_by: 'item_code, batch_no',
    order_by: 'item_code, batch_no',
    limit_page_length: 0,
  });
}

/** The stock of each of an item's batches at the location, as the server sums its ledger. */
export async function getBatchQuantities(
  item: string,
  location?: string
): Promise<StockQuantity[]> {
  const rows = await getStockQuantities(location, [item]);
  return rows.filter((row) => row.batch_no);
}

/** The stock of an item's batch at the location. */
export async function getBatchQuantity(
  item: string,
  batch: string,
  location?: string
): Promise<number> {
  const rows = await getBatchQuantities(item, location);
  return rows.find((row) => row.batch_no === batch)?.actual_qty ?? 0;
}
