import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { toFrappeValue } from 'src/frappe/values';
import { call } from 'src/web/api';

const SALE_SHORTFALLS =
  'frappe_books.inventory.availability.get_sale_shortfalls';

/** An invoice row's item, batch and quantity in the stock unit. */
export type ItemQuantity = {
  item_code?: string;
  batch_no?: string | null;
  stock_qty?: number;
};

/** Tracked items short of stock at the invoice's posting time where the server ships them from. */
export async function getInsufficientItems(
  invoice: SalesInvoice
): Promise<ItemQuantity[]> {
  const date = toFrappeValue(
    invoice.posting_date!,
    invoice.fieldMap.posting_date,
    invoice.fyo
  );
  const time = invoice.posting_time || '23:59:59';
  return await getSaleShortfalls(
    invoice.items ?? [],
    !!invoice.is_pos,
    `${String(date)} ${time}`
  );
}

/**
 * How much of each tracked item, or of its batch, the rows lack where the
 * server ships a sale from, by the date when given, else in all.
 */
export async function getSaleShortfalls(
  rows: ItemQuantity[],
  isPOS: boolean,
  date?: unknown
): Promise<ItemQuantity[]> {
  const items = rows.map(({ item_code, batch_no, stock_qty }) => ({
    item_code,
    batch_no,
    stock_qty,
  }));
  return await call<ItemQuantity[]>(SALE_SHORTFALLS, {
    items,
    date,
    is_pos: isPOS,
  });
}
