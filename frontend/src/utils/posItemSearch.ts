import { POSSettings } from 'models/inventory/Point of Sale/POSSettings';
import { POSItem } from 'src/components/POS/types';
import { getList, type Filter } from 'src/frappe/api';
import { fuzzyMatch } from 'src/utils';

type POSItemSearchRecord = Pick<POSItem, 'name' | 'itemCode' | 'barcode'>;
export type ScannableItem = POSItemSearchRecord & Pick<POSItem, 'unit'>;

type BarcodeSettings = Pick<
  POSSettings,
  | 'weight_enabled_barcode'
  | 'check_digits'
  | 'item_code_digits'
  | 'item_weight_digits'
>;

type WeightBarcode = { itemCode: string; weight?: number };

type POSItemSearchMatch = {
  distance: number;
  isMatch: boolean;
};

const SCANNED_FIELDS = ['name', 'item_code', 'barcode'];

/**
 * The items a scanned code, or the item code in a scale barcode, may name:
 * those whose name, item code or barcode is the code in any case.
 * `findScannedPOSItem` picks the item among them.
 */
export async function getScannableItems(
  code: string,
  settings?: BarcodeSettings
): Promise<ScannableItem[]> {
  const codes = [code, parseWeightBarcode(code, settings)?.itemCode];
  const orFilters = codes
    .filter((value): value is string => !!value)
    .flatMap((value) =>
      SCANNED_FIELDS.map((field): Filter => [field, 'like', value])
    );
  const items = await getList('Books Item', {
    fields: [...SCANNED_FIELDS, 'unit'],
    orFilters,
    orderBy: 'creation desc',
    limit: 0,
  });
  return items.map((item) => ({
    name: item.name as string,
    itemCode: item.item_code as string,
    barcode: item.barcode as string,
    unit: item.unit as string,
  }));
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

/** The item a scanned or typed code names, with the quantity a scale barcode carries. */
export function findScannedPOSItem<T extends ScannableItem>(
  items: T[],
  code: string,
  settings?: BarcodeSettings
): { item: T; quantity: number } | undefined {
  const weighed = parseWeightBarcode(code, settings);
  const item =
    findByBarcode(items, code, weighed) ?? findExactPOSItem(items, code);
  if (!item) {
    return;
  }

  const weight = weighed?.weight;
  if (weight === undefined) {
    return { item, quantity: 1 };
  }

  const isKilogram = item.unit?.toLowerCase() === 'kg';
  return { item, quantity: isKilogram ? weight / 1000 : weight };
}

function findByBarcode<T extends ScannableItem>(
  items: T[],
  code: string,
  weighed?: WeightBarcode
): T | undefined {
  if (weighed) {
    const { itemCode } = weighed;
    return items.find((item) =>
      [item.itemCode, item.barcode].includes(itemCode)
    );
  }

  if (code.length === 12) {
    return items.find((item) => item.barcode === code);
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
  return [item.name, item.itemCode, item.barcode].filter(
    (value): value is string => typeof value === 'string' && !!value
  );
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}
