import { uniqBy } from 'lodash';
import { POSSettings } from 'models/inventory/Point of Sale/POSSettings';
import { ItemQtyMap, POSItem } from 'src/components/POS/types';
import { getList, type Filter } from 'src/frappe/api';
import { toActiveDoctype } from 'src/frappe/mode';
import { call } from 'src/web/api';
import { fuzzyMatch } from 'src/utils';
import { POS_ITEM_FIELDS, toPOSItem } from 'src/utils/pos';
import { getPOSPreference } from 'src/utils/posSetup';

type POSItemSearchRecord = Pick<POSItem, 'name' | 'barcodes'> &
  Partial<Pick<POSItem, 'itemName'>>;
export type ScannableItem = POSItemSearchRecord & Pick<POSItem, 'unit'>;

type BarcodeSettings = Pick<
  POSSettings,
  | 'weight_enabled_barcode'
  | 'check_digits'
  | 'item_code_digits'
  | 'item_weight_digits'
>;

type WeightBarcode = { itemCode: string; weight?: number };

/** A scanned item and the quantity to add: one, or a scale barcode's weight in the stock unit. */
type ScannedItem<T> = { item: T; quantity: number; isStockQuantity: boolean };

type POSItemSearchMatch = {
  distance: number;
  isMatch: boolean;
};

/** The item's name, then its barcode rows. */
function getScannedFields(): string[][] {
  return [['name'], [toActiveDoctype('Books Item Barcode'), 'barcode']];
}

/** The item ERPNext's scan_barcode finds by a barcode, batch, serial number or item code, one at a time. */
export async function getERPNextScannedItem(
  code: string
): Promise<{ item: { name: string }; quantity: number } | undefined> {
  const { item_code } = await call<{ item_code?: string }>(
    'erpnext.stock.utils.scan_barcode',
    { search_value: code.trim() }
  );
  return item_code ? { item: { name: item_code }, quantity: 1 } : undefined;
}

/** The item a scanned or typed code names among all items, whatever a list shows. */
export async function getScannedItem(
  code: string,
  itemQtyMap: ItemQtyMap = {}
): Promise<ScannedItem<POSItem> | undefined> {
  const scannedCode = code.trim();
  if (!scannedCode) {
    return;
  }

  const settings = getBarcodeSettings();
  const items = await getScannableItems(scannedCode, settings, itemQtyMap);
  return findScannedPOSItem(items, scannedCode, settings);
}

/**
 * The items a scanned code, or the item code in a scale barcode, may name:
 * those whose name or a barcode is the code in any case.
 * `findScannedPOSItem` picks the item among them.
 */
async function getScannableItems(
  code: string,
  settings: BarcodeSettings | undefined,
  itemQtyMap: ItemQtyMap
): Promise<POSItem[]> {
  const codes = [code, parseWeightBarcode(code, settings)?.itemCode];
  const orFilters = codes
    .filter((value): value is string => !!value)
    .flatMap((value) =>
      getScannedFields().map((field) => [...field, 'like', value] as Filter)
    );
  const items = await getList(toActiveDoctype('Books Item'), {
    fields: POS_ITEM_FIELDS,
    orFilters,
    orderBy: 'creation desc',
    limit: 0,
  });
  // A barcode row joins its item once per barcode.
  return uniqBy(items, 'name').map((item) => toPOSItem(item, itemQtyMap));
}

/** How POS preferences read scale barcodes. */
function getBarcodeSettings(): BarcodeSettings {
  return {
    weight_enabled_barcode: !!getPOSPreference('weight_enabled_barcode'),
    check_digits: getPOSPreference('check_digits') as number | undefined,
    item_code_digits: getPOSPreference('item_code_digits') as
      number | undefined,
    item_weight_digits: getPOSPreference('item_weight_digits') as
      number | undefined,
  };
}

export function filterPOSItems<T extends POSItemSearchRecord>(
  items: T[],
  searchTerm: string | null | undefined
): T[] {
  const normalizedSearchTerm = searchTerm?.trim() ?? '';
  if (!normalizedSearchTerm) {
    return items;
  }

  return items
    .map((item) => ({ item, match: getBestMatch(item, normalizedSearchTerm) }))
    .filter(({ match }) => match.isMatch)
    .sort((a, b) => a.match.distance - b.match.distance)
    .map(({ item }) => item);
}

export function findExactPOSItem<T extends POSItemSearchRecord>(
  items: T[],
  searchTerm: string | null | undefined
): T | undefined {
  const normalizedSearchTerm = normalize(searchTerm);
  if (!normalizedSearchTerm) {
    return;
  }

  return items.find((item) =>
    getSearchValues(item).some(
      (value) => normalize(value) === normalizedSearchTerm
    )
  );
}

/** The item a scanned or typed code names. */
export function findScannedPOSItem<T extends ScannableItem>(
  items: T[],
  code: string,
  settings?: BarcodeSettings
): ScannedItem<T> | undefined {
  const weighed = parseWeightBarcode(code, settings);
  const item =
    findByBarcode(items, code, weighed) ?? findExactPOSItem(items, code);
  if (!item) {
    return;
  }

  const weight = weighed?.weight;
  if (weight === undefined) {
    return { item, quantity: 1, isStockQuantity: false };
  }

  const isKilogram = item.unit?.toLowerCase() === 'kg';
  const quantity = isKilogram ? weight / 1000 : weight;
  return { item, quantity, isStockQuantity: true };
}

function findByBarcode<T extends ScannableItem>(
  items: T[],
  code: string,
  weighed?: WeightBarcode
): T | undefined {
  if (weighed) {
    const { itemCode } = weighed;
    return items.find((item) => item.barcodes.includes(itemCode));
  }

  if (code.length === 12) {
    return items.find((item) => item.barcodes.includes(code));
  }
}

/** Splits a scale barcode (prefix, item code, weight in grams) per POS Settings. */
function parseWeightBarcode(
  code: string,
  settings?: BarcodeSettings
): WeightBarcode | undefined {
  if (!settings?.weight_enabled_barcode) {
    return;
  }

  const prefix = String(settings.check_digits || '');
  const codeEnd = prefix.length + Number(settings.item_code_digits || 0);
  const length = codeEnd + Number(settings.item_weight_digits || 0);
  const weight = code.slice(codeEnd);
  if (
    !code.startsWith(prefix) ||
    code.length !== length ||
    isNaN(Number(weight))
  ) {
    return;
  }

  return {
    itemCode: code.slice(prefix.length, codeEnd),
    weight: weight ? parseInt(weight, 10) : undefined,
  };
}

function getBestMatch(
  item: POSItemSearchRecord,
  searchTerm: string
): POSItemSearchMatch {
  return getSearchValues(item).reduce<POSItemSearchMatch>(
    (bestMatch, value) => {
      const match = fuzzyMatch(searchTerm, value);
      return match.isMatch && match.distance < bestMatch.distance
        ? match
        : bestMatch;
    },
    { isMatch: false, distance: Number.MAX_SAFE_INTEGER }
  );
}

function getSearchValues(item: POSItemSearchRecord): string[] {
  return [item.name, item.itemName, ...item.barcodes].filter(
    (value): value is string => typeof value === 'string' && !!value
  );
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}
