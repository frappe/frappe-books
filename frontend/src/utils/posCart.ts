import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { Item } from 'models/baseModels/Item/Item';
import {
  getOutOfStockMessage,
  validatePOSStock,
} from 'models/inventory/posStock';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { ItemQtyMap, POSItem } from 'src/components/POS/types';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { safeParseFloat } from 'utils/index';
import { showToast } from './interactive';
import type { POSPermissions } from './posSetup';

export type POSQuantityField = 'quantity' | 'transfer_quantity';
// The rate is per transfer unit, as the quantity is.
export type POSRowField =
  | POSQuantityField
  | 'transfer_rate'
  | 'item_discount_amount'
  | 'item_discount_percent';

/** Sets a cart row value as the POS edits it. */
export async function setPOSRowValue(
  row: SalesInvoiceItem,
  field: POSRowField,
  value: number | Money
) {
  if (field === 'quantity' || field === 'transfer_quantity') {
    return await setPOSRowQuantity(row, field, value as number);
  }

  if (field !== 'transfer_rate') {
    await row.set('set_item_discount_amount', field === 'item_discount_amount');
  }
  await row.set(field, value);
}

/**
 * Sets a cart row's quantity, restoring it if the POS warehouse cannot
 * supply it. A transfer quantity's stock quantity shows at once, for the
 * stock check; the server derives it again.
 */
export async function setPOSRowQuantity(
  row: SalesInvoiceItem,
  field: POSQuantityField,
  value: number
) {
  if (!value || (value < 0 && !row.isReturn)) {
    throw new ValidationError(t`Quantity must be greater than zero.`);
  }

  const previous = {
    quantity: row.quantity,
    transfer_quantity: row.transfer_quantity,
  };
  const quantity = row.isReturn ? -Math.abs(value) : value;
  try {
    await row.set(field, quantity);
    if (field === 'transfer_quantity') {
      row.quantity = quantity * (row.unit_conversion_factor || 1);
    }

    await validateQty(
      row,
      getItemRows(row.parentdoc as SalesInvoice, row.item)
    );
  } catch (error) {
    await row.set(field, previous[field]);
    row.quantity = previous.quantity;
    throw error;
  }
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

/** The quantity field the POS edits: the transfer quantity with UOM conversions. */
export function getPOSQuantityField(): POSQuantityField {
  return fyo.singles.InventorySettings?.enable_uom_conversions
    ? 'transfer_quantity'
    : 'quantity';
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
      return getPOSQuantityField() === 'transfer_quantity';
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

/** The cart's quantity, in the unit the POS edits. */
export function getTotalQuantity(rows: SalesInvoiceItem[]): number {
  const field = getPOSQuantityField();
  return rows.reduce(
    (total, row) => safeParseFloat(total + (row[field] ?? row.quantity ?? 0)),
    0
  );
}

/** Checks the POS location has the stock that a row's item, or its batch, needs. */
export async function validateQty(
  row: SalesInvoiceItem,
  itemRows: SalesInvoiceItem[]
) {
  if (!row.item) {
    return;
  }

  const item = (await getFrappeDoc(ModelNameEnum.Item, row.item)) as Item;
  if (!row.batch && item.has_batch) {
    throw new ValidationError(t`Please select a batch first`);
  }

  if (item.track_item) {
    await validatePOSStock(
      itemRows.filter((existing) => !row.batch || existing.batch === row.batch)
    );
  }
}

/**
 * Leaves a sale row's serial numbers to the server's preview, which picks
 * those in stock, when they no longer match its quantity; a return row
 * keeps the sold ones.
 */
export function refillSerialNumbers(row: SalesInvoiceItem) {
  const quantity = row.quantity ?? 0;
  const count = (row.serial_number ?? '')
    .split('\n')
    .filter((serialNumber) => serialNumber.trim()).length;
  if (quantity > 0 && count !== quantity) {
    row.leaveToServer(['serial_number']);
  }
}

/** Adds `quantity` of a batchless item to its cart row, or to a new row. */
export async function addPOSItem(
  sinvDoc: SalesInvoice,
  item: POSItem,
  quantity: number,
  itemQtyMap: ItemQtyMap
): Promise<SalesInvoiceItem> {
  if (item.trackItem && (itemQtyMap[item.name]?.availableQty ?? 0) <= 0) {
    throw new ValidationError(getOutOfStockMessage(item.name));
  }

  const row = getItemRows(sinvDoc, item.name)[0];
  if (row) {
    await setPOSRowQuantity(row, 'quantity', (row.quantity ?? 0) + quantity);
    return row;
  }

  return await appendItemRow(sinvDoc, item, quantity);
}

/**
 * Add `quantity` of `item` from `batch` to the invoice, merging it into the
 * batch's row. A tracked item needs the whole batch quantity in POS stock.
 */
export async function addBatchItem(
  sinvDoc: SalesInvoice,
  item: POSItem,
  batch: string,
  quantity: number
) {
  const rows = getItemRows(sinvDoc, item.name, batch);
  if (item.trackItem) {
    await validatePOSStock([...rows, { item: item.name, batch, quantity }]);
  }

  if (rows.length) {
    await rows[0].set('quantity', (rows[0].quantity ?? 0) + quantity);
    return;
  }

  await appendItemRow(sinvDoc, item, quantity, batch);
}

export function validateSerialNumberCount(
  serialNumbers: string | undefined,
  quantity: number,
  item: string
) {
  let serialNumberCount = 0;

  if (serialNumbers) {
    serialNumberCount = serialNumbers.split('\n').length;
  }

  if (Math.abs(quantity) !== serialNumberCount) {
    const errorMessage = t`Need ${quantity} Serial Numbers for Item ${item}. You have provided ${serialNumberCount}`;

    showToast({
      type: 'error',
      message: errorMessage,
      duration: 'long',
    });
    throw new ValidationError(errorMessage);
  }
}

/** The cart rows of `item` that are not free items, from `batch` if given. */
function getItemRows(
  sinvDoc: SalesInvoice,
  item?: string,
  batch?: string
): SalesInvoiceItem[] {
  return (sinvDoc.items ?? []).filter(
    (row) =>
      row.item === item && !row.is_free_item && (!batch || row.batch === batch)
  );
}

/** A new row of the item, set as a cashier picks it, so the server prices it and fills its details. */
async function appendItemRow(
  sinvDoc: SalesInvoice,
  item: POSItem,
  quantity: number,
  batch?: string
): Promise<SalesInvoiceItem> {
  await sinvDoc.append('items', { batch });
  const row = sinvDoc.items!.at(-1)!;
  await row.set('item', item.name);
  await row.set('quantity', quantity);
  return row;
}
