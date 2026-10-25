import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import type { Item } from 'models/baseModels/Item/Item';
import { validatePOSStock } from 'models/inventory/posStock';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { ItemQtyMap, ItemVisibility, POSItem } from 'src/components/POS/types';
import type { DocValueMap } from 'fyo/core/types';
import type { Field } from 'schemas/types';
import type { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import {
  getAllDocuments,
  getCount,
  getList,
  type DocValues,
  type Filter,
} from 'src/frappe/api';
import { getField, getSchema } from 'src/frappe/registry';
import { getFrappeDoc } from 'src/frappe/documents';
import { isAccessoryMode, toActiveDoctype } from 'src/frappe/mode';
import { toDocValues } from 'src/frappe/values';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import { reactive } from 'vue';

export { getTotalQuantity } from './posCart';

/** The item fields the POS lists, searches and adds items by. */
export const POS_ITEM_FIELDS = [
  'name',
  'item_name',
  { barcodes: ['barcode'] },
  'image',
  'standard_rate',
  'stock_uom',
  'is_stock_item',
  'has_batch_no',
  'has_serial_no',
];

const TRACKED_ITEMS: Partial<Record<ItemVisibility, number>> = {
  'Inventory Items': 1,
  'Non-Inventory Items': 0,
};

const GET_SELLING_RATES = 'frappe_books.accessory.pos.get_selling_rates';

// The ERPNext items its POS sells
const SOLD_ITEMS: Filter[] = [
  ['disabled', '=', 0],
  ['has_variants', '=', 0],
  ['is_sales_item', '=', 1],
  ['is_fixed_asset', '=', 0],
];

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
  const rows = (sinvDoc.items ?? []).filter((row) => row.item_code);
  const isReturn = !!sinvDoc.return_against;
  for (const { item_code, stock_qty = 0 } of rows) {
    if (!stock_qty || (stock_qty < 0 && !isReturn)) {
      throw new ValidationError(t`Invalid quantity for item ${item_code!}`);
    }
  }

  if (!isReturn) {
    await validatePOSStock(rows, sinvDoc);
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
  const conversions = (doc.uoms ?? []) as { uom?: string }[];
  const units = [doc.stock_uom as string, ...conversions.map(({ uom }) => uom)];
  return {
    hasBatch: !!doc.has_batch_no,
    hasSerialNumber: !!doc.has_serial_no,
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

/** The items the POS lists: those its visibility setting tracks, of the group when given; ERPNext's also of its subgroups. */
export function getPOSItemFilters(
  visibility: ItemVisibility | undefined,
  itemGroup?: string
): Filter[] {
  const filters: Filter[] = [];
  const tracked = visibility && TRACKED_ITEMS[visibility];
  if (tracked !== undefined) {
    filters.push(['is_stock_item', '=', tracked]);
  }

  if (itemGroup) {
    const operator = isAccessoryMode() ? 'descendants of (inclusive)' : '=';
    filters.push(['item_group', operator, itemGroup]);
  }

  return filters;
}

/**
 * The items the POS lists, with the fields `toPOSItem` reads. In accessory
 * mode, the ERPNext items ERPNext's POS sells, of the profile's item groups
 * when it names some, at the rates of the profile's price list.
 */
export async function getPOSItemRecords(
  filters: Filter[],
  profile?: POSProfile | null
): Promise<DocValues[]> {
  if (!isAccessoryMode()) {
    return await getAllDocuments('Books Item', {
      fields: POS_ITEM_FIELDS,
      filters,
    });
  }

  const [items, rates] = await Promise.all([
    getList('Item', {
      fields: POS_ITEM_FIELDS,
      filters: [...filters, ...SOLD_ITEMS],
      orFilters: getProfileGroups(profile).map(
        (group) => ['item_group', 'descendants of (inclusive)', group] as Filter
      ),
      orderBy: 'creation desc',
      limit: 0,
    }),
    getSellingRates(profile),
  ]);
  return items.map((item) => ({
    ...item,
    standard_rate: rates[item.name as string] ?? 0,
  }));
}

/** The item groups the POS filters by: an ERPNext POS Profile's, else every group that holds items. */
export async function getPOSItemGroups(
  profile?: POSProfile | null
): Promise<string[]> {
  const profileGroups = getProfileGroups(profile);
  if (profileGroups.length) {
    return profileGroups;
  }

  const groups = await getAllDocuments(toActiveDoctype('Books Item Group'), {
    fields: ['name'],
    filters: isAccessoryMode() ? [['is_group', '=', 0]] : [],
  });
  return groups.map(({ name }) => name as string);
}

function getProfileGroups(profile?: POSProfile | null): string[] {
  const rows = (profile?.item_groups ?? []) as { item_group?: string }[];
  return rows
    .map(({ item_group }) => item_group)
    .filter((g): g is string => !!g);
}

/** Each item's selling rate in the POS Profile's price list today, as the POS lists it; ERPNext prices the cart's rows. */
async function getSellingRates(
  profile?: POSProfile | null
): Promise<Record<string, number>> {
  if (!profile?.name) {
    return {};
  }

  return await call<Record<string, number>>(GET_SELLING_RATES, {
    pos_profile: profile.name,
  });
}

/** An item as the POS lists it, from its `POS_ITEM_FIELDS`. */
export function toPOSItem(item: DocValues, itemQtyMap: ItemQtyMap): POSItem {
  const name = item.name as string;
  return {
    availableQty: itemQtyMap[name]?.availableQty ?? 0,
    trackItem: !!item.is_stock_item,
    name,
    itemName: (item.item_name as string | undefined) || name,
    barcodes: ((item.barcodes ?? []) as { barcode: string }[]).map(
      ({ barcode }) => barcode
    ),
    image: item.image as string,
    rate: fyo.pesa((item.standard_rate as number) ?? 0),
    unit: item.stock_uom as string,
    hasBatch: !!item.has_batch_no,
    hasSerialNumber: !!item.has_serial_no,
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
      fieldname: 'customer',
      label: t`Customer`,
      fieldtype: 'Data',
      readOnly: true,
    },
    {
      fieldname: 'posting_date',
      label: t`Date`,
      fieldtype: 'Date',
      readOnly: true,
    },
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
  const rows = await getList(toActiveDoctype('Books Sales Invoice'), {
    fields: ['name', 'customer', 'posting_date', 'grand_total', 'docstatus'],
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
  return await getCount(
    toActiveDoctype('Books Sales Invoice'),
    filtersWithSearch,
    []
  );
}

/** The POS invoices of the sale's ERPNext POS Profile, which its shift closes; all in standalone. */
export function getProfileFilters(sale: SalesInvoice): Filter[] {
  if (!isAccessoryMode() || !sale.pos_profile) {
    return [];
  }

  return [['pos_profile', '=', sale.pos_profile]];
}

/** Submitted sales that are not returns and have something left to return; ERPNext checks what is left itself. */
export function getReturnableFilters(): Filter[] {
  if (isAccessoryMode()) {
    return [
      ['docstatus', '=', 1],
      ['is_return', '=', 0],
    ];
  }

  return [
    ['docstatus', '=', 1],
    ['return_against', 'is', 'not set'],
    ['is_fully_returned', '=', 0],
  ];
}

function getPOSInvoiceFilters(filters: Filter[], search: string): Filter[] {
  const nameFilters: Filter[] = search ? [['name', 'like', `%${search}%`]] : [];
  return [['is_pos', '=', 1], ...filters, ...nameFilters];
}

/** The payments of a sales invoice, oldest first; at checkout, those the server made with its submit. */
export async function getInvoicePayments(invoice: string): Promise<string[]> {
  const rows = await call<DocValues[]>('frappe.client.get_list', {
    doctype: 'Books Payment Entry Reference',
    parent: 'Books Payment Entry',
    fields: ['parent'],
    filters: [
      ['reference_doctype', '=', 'Books Sales Invoice'],
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

export interface CostLine {
  label: string;
  value: Money;
  /** A discount or redemption that lowers the total. */
  isDiscount?: boolean;
}

/** The rows' total before their discounts, which the rows' amounts are net of. */
export function getGrossTotal(invoice: SalesInvoice): Money {
  return (invoice.items ?? []).reduce(
    (total, row) => total.add(getRowGrossAmount(invoice, row)),
    fyo.pesa(0)
  );
}

/** The item discounts, before or after tax, as the server posts them. */
export function getItemDiscount(invoice: SalesInvoice): Money {
  return getGrossTotal(invoice)
    .add(invoice.total_taxes_and_charges ?? 0)
    .sub(invoice.grand_total ?? 0);
}

/** What the customer pays: the grand total less what redeemed points pay. */
export function getPayableTotal(invoice: SalesInvoice): Money {
  const loyalty = (invoice.loyalty_amount ?? fyo.pesa(0)).div(
    invoice.conversion_rate || 1
  );
  return (invoice.grand_total ?? fyo.pesa(0)).sub(loyalty);
}

/** What the Pay or Refund button takes, as a positive amount: what a submitted sale still owes, else its payable total. */
export function getAmountToPay(invoice: SalesInvoice): Money {
  const amount = invoice.isSubmitted
    ? invoice.outstanding_amount ?? fyo.pesa(0)
    : getPayableTotal(invoice);
  return amount.abs();
}

/** The rows' total before discounts, then each amount that takes it to the payable total. */
export function getCostLines(invoice: SalesInvoice): CostLine[] {
  const getLabel = (fieldname: string) =>
    getField(invoice.schemaName, fieldname)?.label ?? fieldname;
  const changes = [
    { label: t`Discount`, value: getItemDiscount(invoice), isDiscount: true },
    {
      label: getLabel('taxes'),
      value: invoice.total_taxes_and_charges,
    },
    {
      label: getLabel('loyalty_amount'),
      value: invoice.loyalty_amount,
      isDiscount: true,
    },
  ].filter((line): line is CostLine => !!line.value && !line.value.isZero());

  return [
    { label: getLabel('net_total'), value: getGrossTotal(invoice) },
    ...changes,
  ];
}

/** Titles of the pricing rules cart rows got, by rule name; see `loadPricingRuleTitles`. */
const pricingRuleTitles = reactive<Record<string, string>>({});

/** What a cart row says of the rule it got: the rule's title, else "Free item" on a free row. */
export function getRowPricingRule(row: SalesInvoiceItem): string {
  const rule = getRowPricingRuleName(row);
  const title = rule && pricingRuleTitles[rule];
  if (title) {
    return title;
  }

  return row.is_free_item ? t`Free item` : '';
}

/** The first rule a cart row got, as ERPNext lists a row's pricing rules. */
function getRowPricingRuleName(row: SalesInvoiceItem): string {
  const rules = row.pricing_rules ?? '';
  if (!rules.startsWith('[')) {
    return rules.split(',')[0] ?? '';
  }

  return (JSON.parse(rules) as string[])[0] ?? '';
}

/** Reads the titles of the cart rows' rules not read yet, in one call; a user who cannot read rules sees none. */
export async function loadPricingRuleTitles(rows: SalesInvoiceItem[]) {
  const names = [...new Set(rows.map(getRowPricingRuleName))].filter(
    (name) => name && !(name in pricingRuleTitles)
  );
  if (!names.length || !fyo.can(ModelNameEnum.PricingRule, 'read')) {
    return;
  }

  // A rule that is gone keeps the fallback instead of being asked for again.
  names.forEach((name) => (pricingRuleTitles[name] = ''));
  const rules = await getList(toActiveDoctype('Books Pricing Rule'), {
    fields: ['name', 'title'],
    filters: [['name', 'in', names]],
    limit: names.length,
  });
  for (const { name, title } of rules) {
    pricingRuleTitles[String(name)] = String(title ?? '');
  }
}

/** A row's amount before its discount, as the cart lists it above the discount. */
export function getRowGrossAmount(
  invoice: SalesInvoice,
  row: SalesInvoiceItem
): Money {
  if (invoice.discount_after_tax) {
    return row.amount ?? fyo.pesa(0);
  }

  return (row.price_list_rate ?? fyo.pesa(0)).mul(row.qty ?? 0).clip();
}
