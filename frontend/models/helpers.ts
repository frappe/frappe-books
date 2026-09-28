import {
  AccountRootType,
  AccountRootTypeEnum,
} from './baseModels/Account/types';
import {
  Action,
  BadgeTheme,
  ColumnConfig,
  DocStatus,
  LeadStatus,
  RenderData,
} from 'fyo/model/types';
import { Fyo, t } from 'fyo';
import { InvoiceStatus, ModelNameEnum } from './types';

import { DateTime } from 'luxon';
import { Doc } from 'fyo/model/doc';
import { Invoice } from './baseModels/Invoice/Invoice';
import { Lead } from './baseModels/Lead/Lead';
import { Money } from 'pesa';
import { Router } from 'vue-router';
import { SalesInvoice } from './baseModels/SalesInvoice/SalesInvoice';
import { StockMovement } from './inventory/StockMovement';
import { StockTransfer } from './inventory/StockTransfer';
import { ValidationError } from 'fyo/utils/errors';
import { getIsNullOrUndef, safeParseFloat } from 'utils/index';
import { InvoiceItem } from './baseModels/InvoiceItem/InvoiceItem';
import { SalesInvoiceItem } from './baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { ItemQtyMap, ItemVisibility } from 'src/components/POS/types';
import { getPOSInventory, validatePOSStock } from './inventory/posStock';
import { getSerialNumbersForQuantity } from './inventory/helpers';

const MAPPER_MODULES: Record<string, string> = {
  Item: 'frappe_books.frappe_books.doctype.books_item.books_item',
  Lead: 'frappe_books.frappe_books.doctype.books_lead.books_lead',
  Party: 'frappe_books.frappe_books.doctype.books_party.books_party',
  SalesInvoice:
    'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice',
  PurchaseInvoice:
    'frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice',
  SalesQuote:
    'frappe_books.frappe_books.doctype.books_sales_quote.books_sales_quote',
  Shipment: 'frappe_books.frappe_books.doctype.books_shipment.books_shipment',
  PurchaseReceipt:
    'frappe_books.frappe_books.doctype.books_purchase_receipt.books_purchase_receipt',
};

/** The unsaved `schemaName` document a server mapper, such as make_return, builds from `source`. */
export async function getMappedDoc(
  source: Doc,
  schemaName: string,
  mapper: string
): Promise<Doc> {
  const method = `${MAPPER_MODULES[source.schemaName]}.${mapper}`;
  const values = await source.fyo.db.getMapped(
    schemaName,
    method,
    source.name!
  );
  // Unset values keep the new document's defaults, such as its number series.
  const setValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => !getIsNullOrUndef(value))
  );
  return source.fyo.doc.getNewDoc(
    schemaName,
    setValues,
    true,
    undefined,
    undefined,
    false
  );
}

export function getQuoteActions(
  fyo: Fyo,
  schemaName: ModelNameEnum.SalesQuote
): Action[] {
  return [getMakeInvoiceAction(fyo, schemaName)];
}

export function getLeadActions(fyo: Fyo): Action[] {
  return [getCreateCustomerAction(fyo), getSalesQuoteAction(fyo)];
}

export function getInvoiceActions(
  fyo: Fyo,
  schemaName: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice
): Action[] {
  return [
    getMakePaymentAction(fyo),
    getMakeStockTransferAction(fyo, schemaName),
    getLedgerLinkAction(fyo),
    getMakeReturnDocAction(fyo),
  ];
}

/** Stock of each item, and of each of its batches, at the POS location. */
export async function getItemQtyMap(
  doc: SalesInvoice,
  items?: string[]
): Promise<ItemQtyMap> {
  const location = await getPOSInventory(doc.fyo);
  const rows = await doc.fyo.db.getStockQuantities(location, items);
  const itemQtyMap: ItemQtyMap = {};
  for (const { item, batch, quantity } of rows) {
    itemQtyMap[item] ??= { availableQty: 0 };
    itemQtyMap[item].availableQty += quantity;
    if (batch) {
      itemQtyMap[item][batch] = quantity;
    }
  }

  return itemQtyMap;
}

export async function getItemVisibility(fyo: Fyo): Promise<ItemVisibility> {
  const posProfileName = fyo.singles.POSSettings?.posProfile as string;

  if (posProfileName) {
    const posProfile = await fyo.doc.getDoc(
      ModelNameEnum.POSProfile,
      posProfileName
    );
    return (posProfile?.itemVisibility ??
      fyo.singles.POSSettings?.itemVisibility) as ItemVisibility;
  }

  return fyo.singles.POSSettings?.itemVisibility as ItemVisibility;
}

export function getStockTransferActions(
  fyo: Fyo,
  schemaName: ModelNameEnum.Shipment | ModelNameEnum.PurchaseReceipt
): Action[] {
  return [
    getMakeInvoiceAction(fyo, schemaName),
    getLedgerLinkAction(fyo, false),
    getLedgerLinkAction(fyo, true),
    getMakeReturnDocAction(fyo),
  ];
}

export function getMakeStockTransferAction(
  fyo: Fyo,
  schemaName: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice
): Action {
  let label = fyo.t`Shipment`;
  if (schemaName === ModelNameEnum.PurchaseInvoice) {
    label = fyo.t`Purchase Receipt`;
  }

  return {
    label,
    group: fyo.t`Create`,
    condition: (doc: Doc) => doc.isSubmitted && !!doc.stockNotTransferred,
    action: async (doc: Doc) => {
      const invoice = doc as Invoice;
      const transfer = await getMappedDoc(
        invoice,
        invoice.stockTransferSchemaName,
        invoice.stockTransferMapper
      );
      if (!transfer.name) {
        return;
      }

      const { routeTo } = await import('src/utils/ui');
      const path = `/edit/${transfer.schemaName}/${transfer.name}`;
      await routeTo(path);
    },
  };
}

export function getMakeInvoiceAction(
  fyo: Fyo,
  schemaName:
    | ModelNameEnum.Shipment
    | ModelNameEnum.PurchaseReceipt
    | ModelNameEnum.SalesQuote
): Action {
  const isPurchase = schemaName === ModelNameEnum.PurchaseReceipt;
  const [invoiceSchemaName, mapper] = isPurchase
    ? [ModelNameEnum.PurchaseInvoice, 'make_purchase_invoice']
    : [ModelNameEnum.SalesInvoice, 'make_sales_invoice'];
  return {
    label: isPurchase ? fyo.t`Purchase Invoice` : fyo.t`Sales Invoice`,
    group: fyo.t`Create`,
    condition: (doc: Doc) => {
      if (schemaName === ModelNameEnum.SalesQuote) {
        return doc.isSubmitted;
      } else {
        return (
          doc.isSubmitted &&
          !doc.backReference &&
          !doc.returnAgainst &&
          !doc.isFullyBilled
        );
      }
    },
    action: async (doc: Doc) => {
      const invoice = await getMappedDoc(doc, invoiceSchemaName, mapper);
      if (!invoice.name) {
        return;
      }

      const { routeTo } = await import('src/utils/ui');
      const path = `/edit/${invoice.schemaName}/${invoice.name}`;
      await routeTo(path);
    },
  };
}

export function getCreateCustomerAction(fyo: Fyo): Action {
  return {
    group: fyo.t`Create`,
    label: fyo.t`Customer`,
    condition: (doc: Doc) => !doc.notInserted,
    action: async (doc: Doc, router) => {
      const customer = await getMappedDoc(
        doc,
        ModelNameEnum.Party,
        'make_customer'
      );
      await router.push(`/edit/Party/${customer.name!}`);
    },
  };
}

export function getSalesQuoteAction(fyo: Fyo): Action {
  return {
    group: fyo.t`Create`,
    label: fyo.t`Sales Quote`,
    condition: (doc: Doc) => !doc.notInserted,
    action: async (doc, router) => {
      const quote = await getMappedDoc(
        doc,
        ModelNameEnum.SalesQuote,
        'make_sales_quote'
      );
      await router.push(`/edit/SalesQuote/${quote.name!}`);
    },
  };
}

export function getMakePaymentAction(fyo: Fyo): Action {
  return {
    label: fyo.t`Payment`,
    group: fyo.t`Create`,
    condition: (doc: Doc) =>
      doc.isSubmitted && !(doc.outstandingAmount as Money).isZero(),
    action: async (doc, router) => {
      const payment = await getMappedDoc(
        doc,
        ModelNameEnum.Payment,
        'make_payment'
      );
      await payment.set('referenceType', doc.schemaName);
      const currentRoute = router.currentRoute.value.fullPath;
      payment.once('afterSubmit', async () => {
        await doc.load();
        await router.push(currentRoute);
      });

      // The party account comes from the invoice.
      const hideFields = ['party', 'for', 'account'];

      if (!fyo.singles.AccountingSettings?.enableInvoiceReturns) {
        hideFields.push('paymentType');
      }

      await payment.runFormulas();
      const { openQuickEdit } = await import('src/utils/ui');
      await openQuickEdit({
        doc: payment,
        hideFields,
      });
    },
  };
}

export function getLedgerLinkAction(fyo: Fyo, isStock = false): Action {
  let label = fyo.t`Accounting Entries`;
  let reportClassName: 'GeneralLedger' | 'StockLedger' = 'GeneralLedger';

  if (isStock) {
    label = fyo.t`Stock Entries`;
    reportClassName = 'StockLedger';
  }

  return {
    label,
    group: fyo.t`View`,
    condition: (doc: Doc) => doc.isSubmitted,
    action: async (doc: Doc, router: Router) => {
      const route = getLedgerLink(doc, reportClassName);
      await router.push(route);
    },
  };
}

export function getLedgerLink(
  doc: Doc,
  reportClassName: 'GeneralLedger' | 'StockLedger'
) {
  return {
    name: 'Report',
    params: {
      reportClassName,
    },
    query: {
      defaultFilters: JSON.stringify({
        referenceType: doc.schemaName,
        referenceName: doc.name,
      }),
    },
  };
}
export function getMakeReturnDocAction(fyo: Fyo): Action {
  return {
    label: fyo.t`Return`,
    group: fyo.t`Create`,
    condition: (doc: Doc) =>
      (!!fyo.singles.AccountingSettings?.enableInvoiceReturns ||
        !!fyo.singles.InventorySettings?.enableStockReturns) &&
      doc.isSubmitted &&
      !doc.isReturn,
    action: async (doc: Doc) => {
      const returnDoc = await getMappedDoc(doc, doc.schemaName, 'make_return');
      if (!returnDoc.name) {
        return;
      }

      const { routeTo } = await import('src/utils/ui');
      const path = `/edit/${doc.schemaName}/${returnDoc.name}`;
      await routeTo(path);
    },
  };
}

export function getLeadStatusColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge(doc) {
      const status = getLeadStatus(doc) as LeadStatus;
      return {
        theme: statusColor[status] ?? 'gray',
        label: getStatusTextOfLead(status),
      };
    },
  };
}

export const statusColor: Record<
  DocStatus | InvoiceStatus | LeadStatus,
  BadgeTheme | undefined
> = {
  '': 'gray',
  Draft: 'gray',
  Open: 'gray',
  Replied: 'amber',
  Opportunity: 'amber',
  Unpaid: 'amber',
  Paid: 'green',
  PartlyPaid: 'amber',
  Interested: 'amber',
  Converted: 'green',
  Quotation: 'green',
  Saved: 'blue',
  NotSaved: 'gray',
  Submitted: 'green',
  Cancelled: 'red',
  DonotContact: 'red',
  Return: 'gray',
  ReturnIssued: 'gray',
};

export function getStatusText(status: DocStatus | InvoiceStatus): string {
  switch (status) {
    case 'Draft':
      return t`Draft`;
    case 'Saved':
      return t`Saved`;
    case 'NotSaved':
      return t`Not Saved`;
    case 'Submitted':
      return t`Submitted`;
    case 'Cancelled':
      return t`Cancelled`;
    case 'Paid':
      return t`Paid`;
    case 'Unpaid':
      return t`Unpaid`;
    case 'PartlyPaid':
      return t`Partly Paid`;
    case 'Return':
      return t`Return`;
    case 'ReturnIssued':
      return t`Return Issued`;
    default:
      return '';
  }
}

export function getStatusTextOfLead(status: LeadStatus): string {
  switch (status) {
    case 'Open':
      return t`Open`;
    case 'Replied':
      return t`Replied`;
    case 'Opportunity':
      return t`Opportunity`;
    case 'Interested':
      return t`Interested`;
    case 'Converted':
      return t`Converted`;
    case 'Quotation':
      return t`Quotation`;
    case 'DonotContact':
      return t`Do not Contact`;
    default:
      return '';
  }
}

export function getLeadStatus(
  doc?: Lead | Doc | RenderData
): LeadStatus | DocStatus {
  if (!doc) {
    return '';
  }

  return doc.status as LeadStatus;
}

export function getDocStatus(
  doc?: RenderData | Doc
): DocStatus | InvoiceStatus {
  if (!doc) {
    return '';
  }

  if (doc.notInserted) {
    return 'Draft';
  }

  if (doc.dirty) {
    return 'NotSaved';
  }

  if (!doc.schema?.isSubmittable) {
    return 'Saved';
  }

  // The server stores the status of documents that have a status field.
  if (doc.status) {
    return doc.status as InvoiceStatus;
  }

  if (doc.cancelled) {
    return 'Cancelled';
  }

  return doc.submitted ? 'Submitted' : 'Saved';
}

export function getSerialNumberStatusColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge(doc) {
      let status = doc.status;
      if (typeof status !== 'string') {
        status = 'Inactive';
      }

      return {
        theme: serialNumberStatusColor[status] ?? 'gray',
        label: getSerialNumberStatusText(status),
      };
    },
  };
}

export const serialNumberStatusColor: Record<string, BadgeTheme | undefined> = {
  Inactive: 'gray',
  Active: 'green',
  Delivered: 'blue',
};

export function getSerialNumberStatusText(status: string): string {
  switch (status) {
    case 'Inactive':
      return t`Inactive`;
    case 'Active':
      return t`Active`;
    case 'Delivered':
      return t`Delivered`;
    default:
      return t`Inactive`;
  }
}

export function getPriceListStatusColumn(): ColumnConfig {
  return {
    label: t`Enabled For`,
    fieldname: 'enabledFor',
    fieldtype: 'Select',
    badge({ isSales, isPurchase }) {
      let label = t`None`;

      if (isSales && isPurchase) {
        label = t`Sales and Purchase`;
      } else if (isSales) {
        label = t`Sales`;
      } else if (isPurchase) {
        label = t`Purchase`;
      }

      return { theme: 'gray', label };
    },
  };
}

export function getIsDocEnabledColumn(): ColumnConfig {
  return {
    label: t`Enabled`,
    fieldname: 'enabled',
    fieldtype: 'Data',
    badge(doc) {
      if (doc.isEnabled) {
        return { theme: 'green', label: t`Enabled` };
      }

      return { theme: 'amber', label: t`Disabled` };
    },
  };
}

/**
 * The rate from a public rates service, or undefined when it has none.
 * Only the currency codes and the date leave the browser.
 */
export async function getExchangeRate({
  fromCurrency,
  toCurrency,
  date = DateTime.local().toISODate() as string,
}: {
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}): Promise<number | undefined> {
  const cacheKey = `currencyExchangeRate:${date}:${fromCurrency}:${toCurrency}`;
  const cached = safeParseFloat(localStorage.getItem(cacheKey) as string);
  if (cached > 0) {
    return cached;
  }

  const exchangeRate = await fetchExchangeRate(fromCurrency, toCurrency, date);
  if (exchangeRate) {
    localStorage.setItem(cacheKey, String(exchangeRate));
  }

  return exchangeRate;
}

async function fetchExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number | undefined> {
  const query = new URLSearchParams({
    date,
    base: fromCurrency,
    symbols: toCurrency,
  });
  try {
    const response = await fetch(`https://api.vatcomply.com/rates?${query}`);
    const data = (await response.json()) as { rates?: Record<string, number> };
    const exchangeRate = response.ok ? data.rates?.[toCurrency] : undefined;
    return exchangeRate && exchangeRate > 0 ? exchangeRate : undefined;
  } catch {
    // Offline or an unreadable reply: the user enters the rate instead.
    return undefined;
  }
}

export function isCredit(rootType: AccountRootType) {
  switch (rootType) {
    case AccountRootTypeEnum.Asset:
      return false;
    case AccountRootTypeEnum.Liability:
      return true;
    case AccountRootTypeEnum.Equity:
      return true;
    case AccountRootTypeEnum.Expense:
      return false;
    case AccountRootTypeEnum.Income:
      return true;
    default:
      return true;
  }
}

export function getNumberSeries(schemaName: string, fyo: Fyo) {
  return fyo.defaultNumberSeries[schemaName];
}

export function getDocStatusListColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge(doc) {
      const status = getDocStatus(doc);
      return {
        theme: statusColor[status] ?? 'gray',
        label: getStatusText(status),
      };
    },
  };
}

export function getLoyaltyProgramStatusColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge(doc) {
      const status = getLoyaltyProgramStatus(doc);
      return {
        theme: loyaltyProgramStatusColor[status] ?? 'gray',
        label: getLoyaltyProgramStatusText(status),
      };
    },
  };
}

export function getLoyaltyProgramStatus(doc?: RenderData | Doc): string {
  if (!doc) {
    return '';
  }

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  const toDate = doc.toDate as Date;

  if (toDate && toDate <= currentDate) {
    return 'Expired';
  }

  const maximumUse = doc.maximumUse as number;
  const used = doc.used as number;

  if (maximumUse > 0 && used >= maximumUse) {
    return 'Maxed';
  }

  return 'Active';
}

export const loyaltyProgramStatusColor: Record<string, BadgeTheme | undefined> = {
  Active: 'green',
  Disabled: 'gray',
  Expired: 'red',
  Maxed: 'amber',
};

export function getLoyaltyProgramStatusText(status: string): string {
  switch (status) {
    case 'Active':
      return t`Active`;
    case 'Disabled':
      return t`Disabled`;
    case 'Expired':
      return t`Expired`;
    case 'Maxed':
      return t`Maxed`;
    default:
      return '';
  }
}

type ModelsWithItems = Invoice | StockTransfer | StockMovement;
export async function addItem<M extends ModelsWithItems>(
  name: string,
  doc: M,
  quantity = 1
) {
  if (!doc.canEdit) {
    return;
  }

  const items = (doc.items ?? []) as NonNullable<M['items']>[number][];

  let item = items.find((i) => i.item === name);
  if (item) {
    await item.set('quantity', (item.quantity ?? 0) + quantity);
    return;
  }

  await doc.append('items');
  item = doc.items?.at(-1);
  if (!item) {
    return;
  }

  await item.set('item', name);
  if (quantity !== 1) {
    await item.set('quantity', quantity);
  }

  if (
    doc instanceof StockTransfer &&
    doc.schemaName === ModelNameEnum.PurchaseReceipt
  ) {
    const serialNumbers = await getSerialNumbersForQuantity(
      doc.fyo,
      name,
      undefined,
      quantity
    );
    if (serialNumbers) {
      await item.set('serialNumber', serialNumbers);
    }
  }
}

/** Checks the POS location has the stock that a row's item, or its batch, needs. */
export async function validateQty(
  sinvDoc: SalesInvoice,
  row: SalesInvoiceItem,
  existingItems: InvoiceItem[]
) {
  const { fyo } = sinvDoc;
  const item = row.item;
  if (!item) {
    return;
  }

  if (
    !row.batch &&
    (await fyo.getValue(ModelNameEnum.Item, item, 'hasBatch'))
  ) {
    throw new ValidationError(t`Please select a batch first`);
  }

  if (!(await fyo.getValue(ModelNameEnum.Item, item, 'trackItem'))) {
    return;
  }

  const quantity = existingItems
    .filter((existing) => !row.batch || existing.batch === row.batch)
    .reduce(
      (total, existing) => safeParseFloat(total + (existing.quantity ?? 0)),
      0
    );
  const itemQtyMap = await getItemQtyMap(sinvDoc, [item]);
  const location = await getPOSInventory(fyo);
  validatePOSStock(item, quantity, itemQtyMap, location, row.batch);
}
