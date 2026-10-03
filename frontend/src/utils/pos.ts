import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { Item } from 'models/baseModels/Item/Item';
import { validatePOSStock } from 'models/inventory/posStock';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { ItemQtyMap, ItemVisibility, POSItem } from 'src/components/POS/types';
import type { DocValueMap } from 'fyo/core/types';
import type { Field } from 'schemas/types';
import {
  getCount,
  getList,
  type DocValues,
  type Filter,
} from 'src/frappe/api';
import { getField, getSchema } from 'src/frappe/registry';
import { getFrappeDoc } from 'src/frappe/documents';
import { toDocValues } from 'src/frappe/values';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';

export { getTotalQuantity } from './posCart';

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

/**
 * Checks the sale's quantities, and on the server that the POS location has
 * the stock it ships; a return brings stock back.
 */
export async function validateSinv(sinvDoc: SalesInvoice) {
  const rows = (sinvDoc.items ?? []).filter((row) => row.item);
  const isReturn = !!sinvDoc.return_against;
  for (const { item, quantity = 0 } of rows) {
    if (!quantity || (quantity < 0 && !isReturn)) {
      throw new ValidationError(t`Invalid quantity for item ${item!}`);
    }
  }

  if (!isReturn) {
    await validatePOSStock(rows);
  }
}

/** Checks a POS checkout. A submitted invoice has shipped, so a payment retry skips the check. */
export async function validatePOSCheckout(sinvDoc: SalesInvoice) {
  if (sinvDoc.isSubmitted) {
    return;
  }

  await validateSinv(sinvDoc);
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

/** What is due, then, for a cash sale, the round amounts a customer may hand over. */
export function getPaymentShortcuts(due: Money, isCashSale: boolean): Money[] {
  if (!isCashSale) {
    return [due];
  }

  const notes = getQuickPaymentAmounts(due.float);
  return [due, ...notes.map((note) => fyo.pesa(note))];
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

/** The items the POS lists; Hide Unavailable Items leaves out stock items none is left of. */
export function getListedPOSItems(
  items: DocValues[],
  itemQtyMap: ItemQtyMap,
  hideUnavailable: boolean
): POSItem[] {
  return items
    .map((item) => toPOSItem(item, itemQtyMap))
    .filter(
      ({ trackItem, availableQty }) =>
        !(hideUnavailable && trackItem && availableQty <= 0)
    );
}

/** The columns of the POS invoice pickers. */
export function getPOSInvoiceFields(): Field[] {
  return [
    { fieldname: 'name', label: t`Name`, fieldtype: 'Data', readOnly: true },
    {
      fieldname: 'party',
      label: t`Customer`,
      fieldtype: 'Data',
      readOnly: true,
    },
    { fieldname: 'date', label: t`Date`, fieldtype: 'Date', readOnly: true },
    {
      fieldname: 'grand_total',
      label: t`Grand Total`,
      fieldtype: 'Currency',
      readOnly: true,
    },
  ];
}

/**
 * A page of the POS invoices that match and whose name has `search`, newest
 * first, with the values their lists show; every one without a `limit`.
 */
export async function getPOSInvoices(
  filters: Filter[],
  search = '',
  start = 0,
  limit = 0
): Promise<DocValueMap[]> {
  const schema = getSchema(ModelNameEnum.SalesInvoice)!;
  const rows = await getList('Books Sales Invoice', {
    fields: ['name', 'party', 'date', 'grand_total', 'docstatus'],
    filters: getPOSInvoiceFilters(filters, search),
    orderBy: 'creation desc',
    start,
    limit,
  });
  return rows.map((row) =>
    toDocValues(schema, row, fyo, (target) => getSchema(target)!)
  );
}

/** How many POS invoices match and have `search` in their name. */
export async function getPOSInvoiceCount(
  filters: Filter[],
  search = ''
): Promise<number> {
  const filtersWithSearch = getPOSInvoiceFilters(filters, search);
  return await getCount('Books Sales Invoice', filtersWithSearch, []);
}

function getPOSInvoiceFilters(filters: Filter[], search: string): Filter[] {
  const nameFilters: Filter[] = search ? [['name', 'like', `%${search}%`]] : [];
  return [['is_pos', '=', 1], ...filters, ...nameFilters];
}

/** The payments of a sales invoice, oldest first; at checkout, those the server made with its submit. */
export async function getInvoicePayments(invoice: string): Promise<string[]> {
  const rows = await call<DocValues[]>('frappe.client.get_list', {
    doctype: 'Books Payment For',
    parent: 'Books Payment',
    fields: ['parent'],
    filters: [
      ['reference_type', '=', 'Books Sales Invoice'],
      ['reference_name', '=', invoice],
    ],
    order_by: 'creation asc',
    limit_page_length: 0,
  });
  return rows.map(({ parent }) => parent as string);
}

/** An item the server serves, for its stock tracking, batches and units. */
async function getItemDoc(name: string): Promise<Item> {
  return (await getFrappeDoc(ModelNameEnum.Item, name)) as Item;
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
  /** A discount or redemption that lowers the total. */
  isDiscount?: boolean;
}

/** The net total, then each amount that takes it to the grand total. */
export function getCostLines(invoice: SalesInvoice): CostLine[] {
  const getLabel = (fieldname: string) =>
    getField(invoice.schemaName, fieldname)?.label ?? fieldname;
  const changes = [
    {
      label: getLabel('total_discount'),
      value: invoice.total_discount,
      isDiscount: true,
    },
    { label: getLabel('taxes'), value: getTotalTaxedAmount(invoice) },
    {
      label: getLabel('loyalty_points_amount'),
      value: invoice.loyalty_points_amount,
      isDiscount: true,
    },
  ].filter((line): line is CostLine => !!line.value && !line.value.isZero());

  return [
    { label: getLabel('net_total'), value: invoice.net_total ?? fyo.pesa(0) },
    ...changes,
  ];
}
