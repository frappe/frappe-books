import type { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { toFrappeValue } from 'src/frappe/values';
import { call } from 'src/web/api';

const SALE_SHORTFALLS =
  'frappe_books.inventory.availability.get_sale_shortfalls';

type ItemQuantity = { item: string; batch?: string; quantity: number };

/** Tracked items short of stock on the invoice date where the server ships them from. */
export async function getInsufficientItems(
  invoice: SalesInvoice
): Promise<ItemQuantity[]> {
  const items = (invoice.items ?? []).map(({ item, batch, quantity }) => ({
    item,
    batch,
    quantity,
  }));
  const date = toFrappeValue(invoice.date!, invoice.fieldMap.date, invoice.fyo);
  return await call<ItemQuantity[]>(SALE_SHORTFALLS, {
    items,
    date,
    is_pos: !!invoice.isPOS,
  });
}
