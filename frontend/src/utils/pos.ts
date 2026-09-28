import { Fyo, t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { Item } from 'models/baseModels/Item/Item';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import {
  ItemQtyMap,
  ItemSerialNumbers,
  POSItem,
} from 'src/components/POS/types';
import { fyo } from 'src/initFyo';
import { safeParseFloat } from 'utils/index';
import { showToast } from './interactive';
import { POSClosingShift } from 'models/inventory/Point of Sale/POSClosingShift';
import { getPOSInventory, validatePOSStock } from 'models/inventory/posStock';
import { validateQty } from 'models/helpers';
import { getAvailableSerialNumbers } from 'models/inventory/helpers';

export type POSPermissionSetting = 'canChangeRate' | 'canEditDiscount';
export type POSQuantityField = 'quantity' | 'transferQuantity';
export type POSRowField =
  POSQuantityField | 'rate' | 'itemDiscountAmount' | 'itemDiscountPercent';

/** Sets a cart row value as the POS edits it. */
export async function setPOSRowValue(
  row: SalesInvoiceItem,
  field: POSRowField,
  value: number | Money
) {
  if (field === 'quantity' || field === 'transferQuantity') {
    return await setPOSRowQuantity(row, field, value as number);
  }

  if (field !== 'rate') {
    await row.set('setItemDiscountAmount', field === 'itemDiscountAmount');
  }
  await row.set(field, value);
}

/** Sets a cart row's quantity, restoring it if the POS warehouse cannot supply it. */
export async function setPOSRowQuantity(
  row: SalesInvoiceItem,
  field: POSQuantityField,
  value: number
) {
  if (!value || (value < 0 && !row.isReturn)) {
    throw new ValidationError(t`Quantity must be greater than zero.`);
  }

  const invoice = row.parentdoc as SalesInvoice;
  const previous = {
    quantity: row.quantity,
    transferQuantity: row.transferQuantity,
  };
  try {
    await row.set(field, row.isReturn ? -Math.abs(value) : value);
    await validateQty(invoice, row, getItemRows(invoice, row.item));
  } catch (error) {
    await row.setMultiple(previous);
    throw error;
  }
}

export async function getPOSPermissionSetting(
  fyo: Fyo,
  fieldname: POSPermissionSetting
): Promise<boolean> {
  const profileName = fyo.singles.POSSettings?.posProfile;

  if (profileName) {
    return !!(await fyo.getValue(
      ModelNameEnum.POSProfile,
      profileName as string,
      fieldname
    ));
  }

  return !!fyo.singles.POSSettings?.[fieldname];
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

export async function getPOSOpeningShiftDoc(
  fyo: Fyo
): Promise<POSOpeningShift> {
  const openShift = await fyo.db.getOpenPOSShift();
  if (!openShift) {
    return fyo.doc.getNewDoc(ModelNameEnum.POSOpeningShift) as POSOpeningShift;
  }

  return (await fyo.doc.getDoc(
    ModelNameEnum.POSOpeningShift,
    openShift
  )) as POSOpeningShift;
}

/** Cash-type payment methods, whose amounts the counted denominations cover. */
export async function getCashPaymentMethods(fyo: Fyo): Promise<string[]> {
  const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
    fields: ['name'],
    filters: { type: 'Cash' },
  })) as { name: string }[];
  return methods.map(({ name }) => name);
}

export function getTotalQuantity(items: SalesInvoiceItem[]): number {
  let totalQuantity = safeParseFloat(0);

  if (!items.length) {
    return totalQuantity;
  }

  for (const item of items) {
    const quantity = item.transferQuantity ?? item.quantity ?? 0;
    totalQuantity = safeParseFloat(totalQuantity + quantity);
  }
  return totalQuantity;
}

export async function validateSinv(
  sinvDoc: SalesInvoice,
  itemQtyMap: ItemQtyMap
) {
  if (!sinvDoc) {
    return;
  }

  await validateSinvItems(
    sinvDoc.fyo,
    sinvDoc.items as SalesInvoiceItem[],
    itemQtyMap,
    sinvDoc.returnAgainst as string
  );
}

async function validateSinvItems(
  fyo: Fyo,
  sinvItems: SalesInvoiceItem[],
  itemQtyMap: ItemQtyMap,
  isReturn?: string
) {
  const inventory = await getPOSInventory(fyo);
  const requested: ItemQtyMap = {};
  for (const item of sinvItems) {
    const trackItem = await fyo.getValue(
      ModelNameEnum.Item,
      item.item as string,
      'trackItem'
    );

    if (!trackItem) {
      continue;
    }

    if (!item.quantity || (item.quantity < 0 && !isReturn)) {
      throw new ValidationError(
        t`Invalid Quantity for Item ${item.item as string}`
      );
    }

    if (isReturn) {
      continue;
    }

    const itemName = item.item as string;
    const total = (requested[itemName] ??= { availableQty: 0 });
    total.availableQty = safeParseFloat(total.availableQty + item.quantity);
    validatePOSStock(itemName, total.availableQty, itemQtyMap, inventory);

    if (item.batch) {
      total[item.batch] = safeParseFloat(
        (total[item.batch] ?? 0) + item.quantity
      );
      validatePOSStock(
        itemName,
        total[item.batch],
        itemQtyMap,
        inventory,
        item.batch
      );
    }
  }
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

export type POSRowItem = {
  hasBatch: boolean;
  hasSerialNumber: boolean;
  units: string[];
};

/** A cart row item's batch and serial number tracking, and the units it sells in. */
export async function getPOSRowItem(
  fyo: Fyo,
  item?: string
): Promise<POSRowItem> {
  if (!item) {
    return { hasBatch: false, hasSerialNumber: false, units: [] };
  }

  const doc = (await fyo.doc.getDoc(ModelNameEnum.Item, item)) as Item;
  const units = [doc.unit, ...doc.uomConversions.map(({ uom }) => uom)];
  return {
    hasBatch: !!doc.hasBatch,
    hasSerialNumber: !!doc.hasSerialNumber,
    units: [...new Set(units.filter((unit): unit is string => !!unit))],
  };
}

export function toPOSItem(item: Item, itemQtyMap: ItemQtyMap): POSItem {
  return {
    availableQty: itemQtyMap[item.name as string]?.availableQty ?? 0,
    name: item.name as string,
    itemCode: item.itemCode as string,
    barcode: item.barcode as string,
    image: item.image as string,
    rate: item.rate as Money,
    unit: item.unit as string,
    hasBatch: !!item.hasBatch,
    hasSerialNumber: !!item.hasSerialNumber,
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
    row.fyo,
    item,
    await getPOSInventory(row.fyo),
    quantity
  );
  if (serialNumbers) {
    await row.set('serialNumber', serialNumbers);
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
  const itemDoc = await getItemDoc(sinvDoc, item);
  if (itemDoc.trackItem && (itemQtyMap[item.name]?.availableQty ?? 0) <= 0) {
    throw new ValidationError(
      t`Item ${item.name} is out of stock (quantity is zero)`
    );
  }

  const row = getItemRows(sinvDoc, item.name)[0];
  if (row) {
    await setPOSRowQuantity(row, 'quantity', (row.quantity ?? 0) + quantity);
    return row;
  }

  await sinvDoc.append('items', newItemRow(item, quantity));
  return sinvDoc.items!.at(-1)!;
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
  const itemDoc = await getItemDoc(sinvDoc, item);
  const rows = getItemRows(sinvDoc, item.name, batch);
  if (itemDoc.trackItem) {
    const required = rows.reduce(
      (total, row) => total + (row.quantity ?? 0),
      quantity
    );
    const inventory = await getPOSInventory(sinvDoc.fyo);
    validatePOSStock(item.name, required, itemQtyMap, inventory, batch);
  }

  if (rows.length) {
    await rows[0].set('quantity', (rows[0].quantity ?? 0) + quantity);
    return;
  }

  await sinvDoc.append('items', newItemRow(item, quantity, batch));
}

async function getItemDoc(sinvDoc: SalesInvoice, item: POSItem) {
  return (await sinvDoc.fyo.doc.getDoc(ModelNameEnum.Item, item.name)) as Item;
}

/** The cart rows of `item` that are not free items, from `batch` if given. */
function getItemRows(
  sinvDoc: SalesInvoice,
  item?: string,
  batch?: string
): SalesInvoiceItem[] {
  return (sinvDoc.items ?? []).filter(
    (row) =>
      row.item === item && !row.isFreeItem && (!batch || row.batch === batch)
  );
}

function newItemRow(item: POSItem, quantity: number, batch?: string) {
  return {
    item: item.name,
    quantity,
    transferQuantity: quantity,
    transferUnit: item.unit,
    batch,
  };
}

export function validateIsPosSettingsSet(fyo: Fyo) {
  try {
    const inventory = fyo.singles.POSSettings?.inventory;
    if (!inventory) {
      throw new ValidationError(
        t`POS Inventory is not set. Please set it on POS Settings`
      );
    }

    const cashAccount = fyo.singles.POSSettings?.cashAccount;
    if (!cashAccount) {
      throw new ValidationError(
        t`POS Counter Cash Account is not set. Please set it on POS Settings`
      );
    }

    const writeOffAccount = fyo.singles.POSSettings?.writeOffAccount;
    if (!writeOffAccount) {
      throw new ValidationError(
        t`POS Write Off Account is not set. Please set it on POS Settings`
      );
    }
  } catch (error) {
    showToast({
      type: 'error',
      message: t`${error as string}`,
      duration: 'long',
    });
  }
}

export function getTotalTaxedAmount(sinvDoc: SalesInvoice): Money {
  let totalTaxedAmount = fyo.pesa(0);
  if (!sinvDoc.items?.length || !sinvDoc.taxes?.length) {
    return totalTaxedAmount;
  }

  for (const row of sinvDoc.taxes) {
    totalTaxedAmount = totalTaxedAmount.add(row.amount as Money);
  }
  return totalTaxedAmount;
}

export function validateClosingAmounts(posShiftDoc: POSClosingShift) {
  if (!posShiftDoc) {
    throw new ValidationError(`POS Shift Document not loaded. Please reload.`);
  }

  posShiftDoc.closingAmounts?.forEach((row) => {
    if (row.closingAmount?.isNegative()) {
      throw new ValidationError(
        t`Closing ${row.paymentMethod as string} Amount can not be negative.`
      );
    }
  });
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
