import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { Item } from 'models/baseModels/Item/Item';
import { getAvailableSerialNumbers } from 'models/inventory/helpers';
import {
  getItemQtyMap,
  getPOSInventory,
  validatePOSStock,
} from 'models/inventory/posStock';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import {
  ItemQtyMap,
  ItemSerialNumbers,
  ItemVisibility,
  POSItem,
} from 'src/components/POS/types';
import type { DocValueMap } from 'fyo/core/types';
import { getAllDocuments, type DocValues, type Filter } from 'src/frappe/api';
import { getField, getSchema } from 'src/frappe/registry';
import { getFrappeDoc } from 'src/frappe/documents';
import { toDocValues } from 'src/frappe/values';
import { fyo } from 'src/initFyo';
import { safeParseFloat } from 'utils/index';
import { showToast } from './interactive';
import type { POSPermissions } from './posSetup';

export type POSQuantityField = 'quantity' | 'transfer_quantity';
export type POSRowField =
  POSQuantityField | 'rate' | 'item_discount_amount' | 'item_discount_percent';

/** The item fields the POS lists, searches and adds items by. */
export const POS_ITEM_FIELDS = [
  'name',
  'item_code',
  'barcode',
  'image',
  'rate',
  'unit',
  'track_item',
  'has_batch',
  'has_serial_number',
];

const TRACKED_ITEMS: Partial<Record<ItemVisibility, number>> = {
  'Inventory Items': 1,
  'Non-Inventory Items': 0,
};

/** Sets a cart row value as the POS edits it. */
export async function setPOSRowValue(
  row: SalesInvoiceItem,
  field: POSRowField,
  value: number | Money
) {
  if (field === 'quantity' || field === 'transfer_quantity') {
    return await setPOSRowQuantity(row, field, value as number);
  }

  if (field !== 'rate') {
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
  if (row.is_free_item) {
    return true;
  }

  switch (field) {
    case 'quantity':
      return getPOSQuantityField() === 'transfer_quantity';
    case 'rate':
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

/** Whether a key press types into a field, which POS shortcuts must leave alone. */
export function isTypingInField(event: KeyboardEvent): boolean {
  const { target } = event;
  const isField =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== 'button') ||
    (target instanceof HTMLElement && target.isContentEditable);
  return isField && !(event.altKey || event.metaKey || event.ctrlKey);
}

/** The quick quantity after the key `code`; undefined when the key is not part of it. */
export function getQuickQtyBuffer(
  buffer: string,
  code: string
): string | undefined {
  if (/^(Digit|Numpad)[0-9]$/.test(code)) {
    return buffer + code.slice(-1);
  }

  if (code === 'Backspace') {
    return buffer.slice(0, -1);
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

export async function validateSinv(
  sinvDoc: SalesInvoice,
  itemQtyMap: ItemQtyMap
) {
  if (!sinvDoc) {
    return;
  }

  const rows = sinvDoc.items ?? [];
  const tracked = await getTrackedItems(rows);
  await validateSinvItems(
    rows.filter((row) => tracked.has(row.item!)),
    itemQtyMap,
    !!sinvDoc.return_against
  );
}

/** Checks the tracked rows' quantities, and that the POS location has them. */
async function validateSinvItems(
  rows: SalesInvoiceItem[],
  itemQtyMap: ItemQtyMap,
  isReturn: boolean
) {
  const inventory = await getPOSInventory();
  const requested: ItemQtyMap = {};
  for (const row of rows) {
    const item = row.item!;
    const quantity = row.quantity ?? 0;
    if (!quantity || (quantity < 0 && !isReturn)) {
      throw new ValidationError(t`Invalid Quantity for Item ${item}`);
    }

    if (isReturn) {
      continue;
    }

    const total = (requested[item] ??= { availableQty: 0 });
    total.availableQty = safeParseFloat(total.availableQty + quantity);
    validatePOSStock(item, total.availableQty, itemQtyMap, inventory);

    if (row.batch) {
      total[row.batch] = safeParseFloat((total[row.batch] ?? 0) + quantity);
      validatePOSStock(
        item,
        total[row.batch],
        itemQtyMap,
        inventory,
        row.batch
      );
    }
  }
}

/** The rows' items whose stock is tracked. */
async function getTrackedItems(rows: SalesInvoiceItem[]): Promise<Set<string>> {
  const names = [...new Set(rows.map((row) => row.item!).filter(Boolean))];
  const items = await Promise.all(names.map(getItemDoc));
  return new Set(
    items.filter((item) => item.track_item).map((item) => item.name!)
  );
}

/**
 * Check a POS checkout against freshly loaded stock. A submitted invoice has
 * shipped, so a payment retry skips the check.
 */
export async function validatePOSCheckout(
  sinvDoc: SalesInvoice,
  loadStock: () => Promise<ItemQtyMap>
) {
  if (sinvDoc.isSubmitted) {
    return;
  }

  await validateSinv(sinvDoc, await loadStock());
}

/** Checks the POS location has the stock that a row's item, or its batch, needs. */
export async function validateQty(
  row: SalesInvoiceItem,
  itemRows: SalesInvoiceItem[]
) {
  if (!row.item) {
    return;
  }

  const item = await getItemDoc(row.item);
  if (!row.batch && item.has_batch) {
    throw new ValidationError(t`Please select a batch first`);
  }

  if (!item.track_item) {
    return;
  }

  const quantity = itemRows
    .filter((existing) => !row.batch || existing.batch === row.batch)
    .reduce(
      (total, existing) => safeParseFloat(total + (existing.quantity ?? 0)),
      0
    );
  const itemQtyMap = await getItemQtyMap([row.item]);
  const location = await getPOSInventory();
  validatePOSStock(row.item, quantity, itemQtyMap, location, row.batch);
}

export type POSRowItem = {
  hasBatch: boolean;
  hasSerialNumber: boolean;
  units: string[];
};

/** A cart row item's batch and serial number tracking, and the units it sells in. */
export async function getPOSRowItem(item?: string): Promise<POSRowItem> {
  if (!item) {
    return { hasBatch: false, hasSerialNumber: false, units: [] };
  }

  const doc = await getItemDoc(item);
  const conversions = (doc.uom_conversions ?? []) as { uom?: string }[];
  const units = [doc.unit as string, ...conversions.map(({ uom }) => uom)];
  return {
    hasBatch: !!doc.has_batch,
    hasSerialNumber: !!doc.has_serial_number,
    units: [...new Set(units.filter((unit): unit is string => !!unit))],
  };
}

/** Up to two initials that stand in for an item without an image. */
export function getItemInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/** Round cash amounts above `due` that a customer may hand over. */
export function getQuickPaymentAmounts(due: number, count = 2): number[] {
  const amounts: number[] = [];
  for (let note = 1; amounts.length < count && note < due * 100; note *= 10) {
    for (const size of [note, note * 5]) {
      const amount = (Math.floor(due / size) + 1) * size;
      if (size >= due / 100 && !amounts.includes(amount)) {
        amounts.push(amount);
      }
    }
  }

  return amounts.slice(0, count);
}

/** The items the POS lists: those its visibility setting tracks, of the group when given. */
export function getPOSItemFilters(
  visibility: ItemVisibility | undefined,
  itemGroup?: string
): Filter[] {
  const filters: Filter[] = [];
  const tracked = visibility && TRACKED_ITEMS[visibility];
  if (tracked !== undefined) {
    filters.push(['track_item', '=', tracked]);
  }

  if (itemGroup) {
    filters.push(['item_group', '=', itemGroup]);
  }

  return filters;
}

/** An item as the POS lists it, from its `POS_ITEM_FIELDS`. */
export function toPOSItem(item: DocValues, itemQtyMap: ItemQtyMap): POSItem {
  const name = item.name as string;
  return {
    availableQty: itemQtyMap[name]?.availableQty ?? 0,
    trackItem: !!item.track_item,
    name,
    itemCode: item.item_code as string,
    barcode: item.barcode as string,
    image: item.image as string,
    rate: fyo.pesa((item.rate as number) ?? 0),
    unit: item.unit as string,
    hasBatch: !!item.has_batch,
    hasSerialNumber: !!item.has_serial_number,
  };
}

/** Fills a sale row with in-stock serial numbers; a return row keeps the sold ones. */
export async function fillRowSerialNumbers(
  row: SalesInvoiceItem,
  itemSerialNumbers: ItemSerialNumbers
) {
  const item = row.item as string;
  const quantity = row.quantity ?? 0;
  const existing = (itemSerialNumbers[item] ?? '')
    .split('\n')
    .filter((serialNumber) => serialNumber.trim());
  if (quantity <= 0 || existing.length === quantity) {
    return;
  }

  const serialNumbers = await getAvailableSerialNumbers(
    item,
    await getPOSInventory(),
    quantity
  );
  if (serialNumbers) {
    await row.set('serial_number', serialNumbers);
    itemSerialNumbers[item] = serialNumbers;
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
    throw new ValidationError(
      t`Item ${item.name} is out of stock (quantity is zero)`
    );
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
  quantity: number,
  itemQtyMap: ItemQtyMap
) {
  const rows = getItemRows(sinvDoc, item.name, batch);
  if (item.trackItem) {
    const required = rows.reduce(
      (total, row) => total + (row.quantity ?? 0),
      quantity
    );
    const inventory = await getPOSInventory();
    validatePOSStock(item.name, required, itemQtyMap, inventory, batch);
  }

  if (rows.length) {
    await rows[0].set('quantity', (rows[0].quantity ?? 0) + quantity);
    return;
  }

  await appendItemRow(sinvDoc, item, quantity, batch);
}

/** POS invoices that match, newest first, with the values their lists show. */
export async function getPOSInvoices(
  filters: Filter[]
): Promise<DocValueMap[]> {
  const schema = getSchema(ModelNameEnum.SalesInvoice)!;
  const rows = await getAllDocuments('Books Sales Invoice', {
    fields: ['name', 'party', 'date', 'grand_total', 'docstatus'],
    filters: [['is_pos', '=', 1], ...filters],
  });
  return rows.map((row) =>
    toDocValues(schema, row, fyo, (target) => getSchema(target)!)
  );
}

/** An item the server serves, for its stock tracking, batches and units. */
async function getItemDoc(name: string): Promise<Item> {
  return (await getFrappeDoc(ModelNameEnum.Item, name)) as Item;
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

export function getTotalTaxedAmount(sinvDoc: SalesInvoice): Money {
  let totalTaxedAmount = fyo.pesa(0);
  if (!sinvDoc.items?.length || !sinvDoc.taxes?.length) {
    return totalTaxedAmount;
  }

  for (const row of sinvDoc.taxes) {
    totalTaxedAmount = totalTaxedAmount.add(row.amount ?? 0);
  }
  return totalTaxedAmount;
}

export interface CostLine {
  label: string;
  value: Money;
}

/** The net total, then each amount that takes it to the grand total. */
export function getCostLines(invoice: SalesInvoice): CostLine[] {
  const getLabel = (fieldname: string) =>
    getField(invoice.schemaName, fieldname)?.label ?? fieldname;
  const changes = [
    { label: getLabel('total_discount'), value: invoice.total_discount },
    { label: getLabel('taxes'), value: getTotalTaxedAmount(invoice) },
    {
      label: getLabel('loyalty_points_amount'),
      value: invoice.loyalty_points_amount,
    },
  ].filter((line): line is CostLine => !!line.value && !line.value.isZero());

  return [
    { label: getLabel('net_total'), value: invoice.net_total ?? fyo.pesa(0) },
    ...changes,
  ];
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
