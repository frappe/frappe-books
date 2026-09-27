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

export type POSPermissionSetting = 'canChangeRate' | 'canEditDiscount';

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

export async function getItem(item: string): Promise<Item | undefined> {
  const itemDoc = (await fyo.doc.getDoc(ModelNameEnum.Item, item)) as Item;
  if (!itemDoc) {
    return;
  }

  return itemDoc;
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
 * Check a POS checkout against freshly loaded stock. A payment retry skips
 * the check once the invoice's stock has shipped.
 */
export async function validatePOSCheckout(
  sinvDoc: SalesInvoice,
  loadStock: () => Promise<ItemQtyMap>,
  itemSerialNumbers: ItemSerialNumbers
) {
  if (sinvDoc.isSubmitted && !sinvDoc.stockNotTransferred) {
    return;
  }

  await validateSinv(sinvDoc, await loadStock());
  if (!sinvDoc.isReturn) {
    await validateShipment(itemSerialNumbers);
  }
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
  const itemDoc = (await sinvDoc.fyo.doc.getDoc(
    ModelNameEnum.Item,
    item.name
  )) as Item;
  const rows =
    sinvDoc.items?.filter(
      (row) => row.item === item.name && row.batch === batch && !row.isFreeItem
    ) ?? [];

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

  await sinvDoc.append('items', {
    item: item.name,
    quantity,
    transferQuantity: quantity,
    transferUnit: item.unit,
    hsnCode: itemDoc.hsnCode,
    batch,
  });
}

export async function validateShipment(itemSerialNumbers: ItemSerialNumbers) {
  if (!itemSerialNumbers) {
    return;
  }

  for (const idx in itemSerialNumbers) {
    const serialNumbers = itemSerialNumbers[idx].split('\n');

    for (const serialNumber of serialNumbers) {
      const status = await fyo.getValue(
        ModelNameEnum.SerialNumber,
        serialNumber,
        'status'
      );

      if (status !== 'Active') {
        throw new ValidationError(
          t`Serial Number ${serialNumber} status is not Active.`
        );
      }
    }
  }
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
