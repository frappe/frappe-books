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

type QuantityField = 'quantity' | 'transfer_quantity';
// The rate is per transfer unit, as the quantity is.
export type POSRowField =
  | QuantityField
  | 'transfer_rate'
  | 'item_discount_amount'
  | 'item_discount_percent';

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
  await validateStock(item.name, batch, [{ item: item.name, batch, quantity }]);
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
  const previous = {
    quantity: row.quantity,
    transfer_quantity: row.transfer_quantity,
  };
  try {
    await writeQuantity(row, field, quantity);
    const rows = getItemRows(
      row.parentdoc as SalesInvoice,
      row.item,
      row.batch
    );
    await validateStock(row.item as string, row.batch, rows);
  } catch (error) {
    await row.set(field, previous[field]);
    row.quantity = previous.quantity;
    throw error;
  }

  refillSerialNumbers(row);
}

/** Adds `step`, which may be negative, to a cart row's quantity. */
export async function stepCartQuantity(row: SalesInvoiceItem, step: number) {
  await setCartQuantity(row, getCartRowQuantity(row) + step);
}

/**
 * A cart row's quantity as the cart shows it: in the transfer unit with UOM
 * conversions, and unsigned on a return.
 */
export function getCartRowQuantity(row: SalesInvoiceItem): number {
  return Math.abs(row[getQuantityField()] ?? 0);
}

/** Sells a cart row in another unit; its stock quantity, and so its serial numbers, follow on the server. */
export async function setCartUnit(row: SalesInvoiceItem, unit: string) {
  await row.set('transfer_unit', unit);
  if (!row.isReturn) {
    row.leaveToServer(['serial_number']);
  }
}

/** Sets a cart row value as the cashier edits it; only the quantity field the cart shows is editable. */
export async function setPOSRowValue(
  row: SalesInvoiceItem,
  field: POSRowField,
  value: number | Money
) {
  if (field === 'quantity' || field === 'transfer_quantity') {
    return await setCartQuantity(row, value as number);
  }

  if (field !== 'transfer_rate') {
    await row.set('set_item_discount_amount', field === 'item_discount_amount');
  }
  await row.set(field, value);
}

/** A cart row field's label, as the cart and its keypad show it. */
export function getPOSRowFieldLabel(
  row: SalesInvoiceItem,
  field: POSRowField
): string {
  if (field === 'transfer_quantity') {
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
    case 'quantity':
      return getQuantityField() !== 'quantity';
    case 'transfer_rate':
      return !permissions.canChangeRate;
    case 'item_discount_amount':
      return (
        !permissions.canEditDiscount || (row.item_discount_percent ?? 0) > 0
      );
    case 'item_discount_percent':
      return (
        !permissions.canEditDiscount || !row.item_discount_amount?.isZero()
      );
    default:
      return false;
  }
}

/** Each item's quantity in the cart, free items aside, as its rows show it. */
export function getQuantityByItem(sale: SalesInvoice): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const row of sale.items ?? []) {
    if (row.item && !row.is_free_item) {
      quantities[row.item] = safeParseFloat(
        (quantities[row.item] ?? 0) + getCartRowQuantity(row)
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
  const quantity = Math.abs(row.quantity ?? 0);
  const count = getSerialNumberCount(row);
  if (count !== quantity) {
    throw new ValidationError(
      t`Need ${quantity} Serial Numbers for Item ${row.item!}. You have provided ${count}`
    );
  }
}

/** The quantity field the cart shows and edits: the transfer quantity with UOM conversions. */
function getQuantityField(): QuantityField {
  return fyo.singles.InventorySettings?.enable_uom_conversions
    ? 'transfer_quantity'
    : 'quantity';
}

/** A stock quantity in the unit the cart row shows. */
function toCartQuantity(row: SalesInvoiceItem, stockQuantity: number): number {
  if (getQuantityField() === 'quantity') {
    return stockQuantity;
  }

  return stockQuantity / (row.unit_conversion_factor || 1);
}

/**
 * Sets the row's quantity in `field`, which the row signs as its sale takes
 * it. A transfer quantity's stock quantity shows at once, for the stock
 * check; the server derives it again.
 */
async function writeQuantity(
  row: SalesInvoiceItem,
  field: QuantityField,
  quantity: number
) {
  await row.set(field, quantity);
  if (field === 'transfer_quantity') {
    row.quantity = row.transfer_quantity! * (row.unit_conversion_factor || 1);
  }
}

/** Checks the POS location has the stock that `rows` of the item, from `batch`, need. */
async function validateStock(
  item: string,
  batch: string | undefined,
  rows: ItemQuantity[]
) {
  const doc = (await getFrappeDoc(ModelNameEnum.Item, item)) as Item;
  if (doc.has_batch && !batch) {
    throw new ValidationError(t`Please select a batch first`);
  }

  if (doc.track_item) {
    await validatePOSStock(rows);
  }
}

/**
 * Leaves a sale row's serial numbers to the server's preview, which picks
 * those in stock, when they no longer match its quantity; a return row
 * keeps the sold ones.
 */
function refillSerialNumbers(row: SalesInvoiceItem) {
  const quantity = row.quantity ?? 0;
  if (quantity > 0 && getSerialNumberCount(row) !== quantity) {
    row.leaveToServer(['serial_number']);
  }
}

function getSerialNumberCount(row: SalesInvoiceItem): number {
  return (row.serial_number ?? '')
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
      row.item === item && !row.is_free_item && (!batch || row.batch === batch)
  );
}

/** A new row of the item, set as a cashier picks it, so the server prices it and fills its details. */
async function appendRow(
  sale: SalesInvoice,
  item: string,
  quantity: number,
  batch?: string
): Promise<SalesInvoiceItem> {
  await sale.append('items', { batch });
  const row = sale.items!.at(-1)!;
  await row.set('item', item);
  await writeQuantity(row, getQuantityField(), quantity);
  return row;
}
