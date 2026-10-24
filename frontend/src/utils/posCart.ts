import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { Item } from 'models/baseModels/Item/Item';
import type { ItemQuantity } from 'models/inventory/insufficientStock';
import { validatePOSStock } from 'models/inventory/posStock';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { POSItem } from 'src/components/POS/types';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { safeParseFloat } from 'utils/index';
import type { POSPermissions } from './posSetup';

type QuantityField = 'stock_qty' | 'qty';
// The rate and the discount amount are per the row's unit, as its quantity is.
export type POSRowField =
  QuantityField | 'price_list_rate' | 'discount_amount' | 'discount_percentage';

/** How `addToCart` adds: from `batch` if given, and in the stock unit if `isStockQuantity`, as a scale barcode does. */
export type CartAddition = { batch?: string; isStockQuantity?: boolean };

/**
 * Adds `quantity` of a POS item to its cart row or to a new one, if the POS
 * location has the stock the item's rows then need. The quantity is in the
 * unit the cart shows, unless `isStockQuantity`.
 */
export async function addToCart(
  sale: SalesInvoice,
  item: POSItem,
  quantity: number,
  { batch, isStockQuantity = false }: CartAddition = {}
): Promise<SalesInvoiceItem> {
  const row = getItemRows(sale, item.name, batch)[0];
  if (row) {
    await stepCartQuantity(
      row,
      isStockQuantity ? toCartQuantity(row, quantity) : quantity
    );
    return row;
  }

  // A new row sells in the item's stock unit.
  await validateStock(item.name, batch, [
    { item_code: item.name, batch_no: batch, stock_qty: quantity },
  ]);
  return await appendRow(sale, item.name, quantity, batch);
}

/**
 * Sets a cart row's quantity as the cart shows it. Restores it when the POS
 * location cannot supply it, else leaves serial numbers that no longer
 * match to the server.
 */
export async function setCartQuantity(row: SalesInvoiceItem, quantity: number) {
  if (!quantity || (quantity < 0 && !row.isReturn)) {
    throw new ValidationError(t`Quantity must be greater than zero.`);
  }

  const field = getQuantityField();
  const previous = { stock_qty: row.stock_qty, qty: row.qty };
  try {
    await writeQuantity(row, field, quantity);
    const rows = getItemRows(
      row.parentdoc as SalesInvoice,
      row.item_code,
      row.batch_no
    );
    await validateStock(row.item_code as string, row.batch_no, rows);
  } catch (error) {
    await row.set(field, previous[field]);
    Object.assign(row, previous);
    throw error;
  }

  refillSerialNumbers(row);
}

/** Adds `step`, which may be negative, to a cart row's quantity; stepping below one unit does nothing. */
export async function stepCartQuantity(row: SalesInvoiceItem, step: number) {
  const quantity = getCartRowQuantity(row) + step;
  if (quantity > 0) {
    await setCartQuantity(row, quantity);
  }
}

/**
 * A cart row's quantity as the cart shows it: in the row's unit with UOM
 * conversions, and unsigned on a return.
 */
export function getCartRowQuantity(row: SalesInvoiceItem): number {
  return Math.abs(row[getQuantityField()] ?? 0);
}

/** Sells a cart row in another unit; its stock quantity, and so its serial numbers, follow on the server. */
export async function setCartUnit(row: SalesInvoiceItem, unit: string) {
  await row.set('uom', unit);
  if (!row.isReturn) {
    row.leaveToServer(['serial_no']);
  }
}

/** Sets a cart row value as the cashier edits it; only the quantity field the cart shows is editable. */
export async function setPOSRowValue(
  row: SalesInvoiceItem,
  field: POSRowField,
  value: number | Money
) {
  if (field === 'stock_qty' || field === 'qty') {
    return await setCartQuantity(row, value as number);
  }

  // A row discounts by a percentage or by an amount per unit, as ERPNext's does.
  if (field === 'discount_amount') {
    row.discount_percentage = 0;
  } else if (field === 'discount_percentage') {
    row.discount_amount = fyo.pesa(0);
  }
  await row.set(field, value);
}

/** A cart row field's label, as the cart and its keypad show it. */
export function getPOSRowFieldLabel(
  row: SalesInvoiceItem,
  field: POSRowField
): string {
  if (field === 'qty') {
    return t`Transfer Quantity`;
  }

  return row.fieldMap[field]?.label;
}

export function isPOSRowFieldReadOnly(
  row: SalesInvoiceItem,
  field: POSRowField,
  permissions: POSPermissions
): boolean {
  if (row.is_free_item || row.parentdoc?.isSubmitted) {
    return true;
  }

  switch (field) {
    case 'stock_qty':
      return getQuantityField() !== 'stock_qty';
    case 'price_list_rate':
      return !permissions.canChangeRate;
    case 'discount_amount':
      return !permissions.canEditDiscount || (row.discount_percentage ?? 0) > 0;
    case 'discount_percentage':
      // The server works out a percentage's amount, which then stays editable as the percentage.
      return (
        !permissions.canEditDiscount ||
        (!row.discount_percentage && !row.discount_amount?.isZero())
      );
    default:
      return false;
  }
}

/** Each item's quantity in the cart, free items aside, as its rows show it. */
export function getQuantityByItem(sale: SalesInvoice): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const row of sale.items ?? []) {
    if (row.item_code && !row.is_free_item) {
      quantities[row.item_code] = safeParseFloat(
        (quantities[row.item_code] ?? 0) + getCartRowQuantity(row)
      );
    }
  }

  return quantities;
}

/** The quantity of the rows, as the cart shows them. */
export function getTotalQuantity(rows: SalesInvoiceItem[]): number {
  return rows.reduce(
    (total, row) => safeParseFloat(total + getCartRowQuantity(row)),
    0
  );
}

/** Checks a cart row has a serial number for each unit it sells or takes back. */
export function validateSerialNumberCount(row: SalesInvoiceItem) {
  const quantity = Math.abs(row.stock_qty ?? 0);
  const count = getSerialNumberCount(row);
  if (count !== quantity) {
    throw new ValidationError(
      t`Need ${quantity} Serial Numbers for Item ${row.item_code!}. You have provided ${count}`
    );
  }
}

/** The quantity field the cart shows and edits: the quantity in the row's unit with UOM conversions. */
function getQuantityField(): QuantityField {
  return fyo.singles.InventorySettings?.enable_uom_conversions
    ? 'qty'
    : 'stock_qty';
}

/** A stock quantity in the unit the cart row shows. */
function toCartQuantity(row: SalesInvoiceItem, stockQuantity: number): number {
  if (getQuantityField() === 'stock_qty') {
    return stockQuantity;
  }

  return stockQuantity / (row.conversion_factor || 1);
}

/**
 * Sets the row's quantity in `field`, which the row signs as its sale takes
 * it. The other quantity shows at once, for the stock check and the cart;
 * the server derives it again.
 */
async function writeQuantity(
  row: SalesInvoiceItem,
  field: QuantityField,
  quantity: number
) {
  await row.set(field, quantity);
  const factor = row.conversion_factor || 1;
  if (field === 'qty') {
    row.stock_qty = row.qty! * factor;
  } else {
    row.qty = row.stock_qty! / factor;
  }
}

/** Checks the POS location has the stock that `rows` of the item, from `batch`, need. */
async function validateStock(
  item: string,
  batch: string | undefined,
  rows: ItemQuantity[]
) {
  const doc = (await getFrappeDoc(ModelNameEnum.Item, item)) as Item;
  if (doc.has_batch_no && !batch) {
    throw new ValidationError(t`Please select a batch first`);
  }

  if (doc.is_stock_item) {
    await validatePOSStock(rows);
  }
}

/**
 * Leaves a sale row's serial numbers to the server's preview, which picks
 * those in stock, when they no longer match its quantity; a return row
 * keeps the sold ones.
 */
function refillSerialNumbers(row: SalesInvoiceItem) {
  const quantity = row.stock_qty ?? 0;
  if (quantity > 0 && getSerialNumberCount(row) !== quantity) {
    row.leaveToServer(['serial_no']);
  }
}

function getSerialNumberCount(row: SalesInvoiceItem): number {
  return (row.serial_no ?? '')
    .split('\n')
    .filter((serialNumber) => serialNumber.trim()).length;
}

/** The cart rows of `item` that are not free items, from `batch` if given. */
function getItemRows(
  sale: SalesInvoice,
  item?: string,
  batch?: string
): SalesInvoiceItem[] {
  return (sale.items ?? []).filter(
    (row) =>
      row.item_code === item &&
      !row.is_free_item &&
      (!batch || row.batch_no === batch)
  );
}

/** A new row of the item, set as a cashier picks it, so the server prices it and fills its details. */
async function appendRow(
  sale: SalesInvoice,
  item: string,
  quantity: number,
  batch?: string
): Promise<SalesInvoiceItem> {
  await sale.append('items', { batch_no: batch });
  const row = sale.items!.at(-1)!;
  await row.set('item_code', item);
  await writeQuantity(row, getQuantityField(), quantity);
  return row;
}
