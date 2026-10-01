import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { toFrappeValue } from 'src/frappe/values';
import { call } from 'src/web/api';

const SALE_SHORTFALLS =
  'frappe_books.inventory.availability.get_sale_shortfalls';

export type ItemQuantity = {
  item?: string;
  batch?: string | null;
  quantity?: number;
};

/** Tracked items short of stock on the invoice date where the server ships them from. */
export async function getInsufficientItems(
  invoice: SalesInvoice
): Promise<ItemQuantity[]> {
  const date = toFrappeValue(invoice.date!, invoice.fieldMap.date, invoice.fyo);
  return await getSaleShortfalls(invoice.items ?? [], !!invoice.is_pos, date);
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
  const items = rows.map(({ item, batch, quantity }) => ({
    item,
    batch,
    quantity,
  }));
  return await call<ItemQuantity[]>(SALE_SHORTFALLS, {
    items,
    date,
    is_pos: isPOS,
  });
}
