import {
  AccountRootType,
  AccountRootTypeEnum,
} from './baseModels/Account/types';
import {
  Action,
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
import { Item } from 'models/baseModels/Item/Item';
import { SalesInvoice } from './baseModels/SalesInvoice/SalesInvoice';
import { StockMovement } from './inventory/StockMovement';
import { StockTransfer } from './inventory/StockTransfer';
import { ValidationError } from 'fyo/utils/errors';
import { numberSeriesDefaultsMap } from './baseModels/Defaults/Defaults';
import { getIsNullOrUndef, safeParseFloat } from 'utils/index';
import { InvoiceItem } from './baseModels/InvoiceItem/InvoiceItem';
import { SalesInvoiceItem } from './baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { ItemQtyMap, ItemVisibility, POSItem } from 'src/components/POS/types';
import { getPOSInventory } from './inventory/posStock';
import {
  getRawStockLedgerEntries,
  getStockBalanceEntries,
  getStockLedgerEntries,
} from 'reports/inventory/helpers';
import {
  generateSerialNumbersForItem,
  generateBatchForItem,
} from './inventory/helpers';

const MAPPER_MODULES: Record<string, string> = {
  SalesInvoice:
    'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice',
  PurchaseInvoice:
    'frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice',
  SalesQuote:
    'frappe_books.frappe_books.doctype.books_sales_quote.books_sales_quote',
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

export async function getItemQtyMap(doc: SalesInvoice): Promise<ItemQtyMap> {
  const itemQtyMap: ItemQtyMap = {};
  const rawSLEs = await getRawStockLedgerEntries(doc.fyo);
  const rawData = getStockLedgerEntries(rawSLEs);

  const inventoryLocation = await getPOSInventory(doc.fyo);

  const stockBalance = getStockBalanceEntries(rawData, {
    location: inventoryLocation,
  });

  for (const row of stockBalance) {
    if (!itemQtyMap[row.item]) {
      itemQtyMap[row.item] = { availableQty: 0 };
    }

    if (row.batch) {
      itemQtyMap[row.item][row.batch] = row.balanceQuantity;
    }

    itemQtyMap[row.item]!.availableQty += row.balanceQuantity;
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
      const transfer = await (doc as Invoice).getStockTransfer();
      if (!transfer || !transfer.name) {
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
  let label = fyo.t`Sales Invoice`;
  if (schemaName === ModelNameEnum.PurchaseReceipt) {
    label = fyo.t`Purchase Invoice`;
  }

  return {
    label,
    group: fyo.t`Create`,
    condition: (doc: Doc) => {
      if (schemaName === ModelNameEnum.SalesQuote) {
        return doc.isSubmitted;
      } else {
        return doc.isSubmitted && !doc.backReference;
      }
    },
    action: async (doc: Doc) => {
      const invoice =
        doc instanceof StockTransfer
          ? await doc.getInvoice()
          : await getMappedDoc(
              doc,
              ModelNameEnum.SalesInvoice,
              'make_sales_invoice'
            );
      if (!invoice || !invoice.name) {
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
      const customerData = (doc as Lead).createCustomer();

      if (!customerData.name) {
        return;
      }
      await router.push(`/edit/Party/${customerData.name}`);
    },
  };
}

export function getSalesQuoteAction(fyo: Fyo): Action {
  return {
    group: fyo.t`Create`,
    label: fyo.t`Sales Quote`,
    condition: (doc: Doc) => !doc.notInserted,
    action: async (doc, router) => {
      const salesQuoteData = (doc as Lead).createSalesQuote();
      if (!salesQuoteData.name) {
        return;
      }
      await router.push(`/edit/SalesQuote/${salesQuoteData.name}`);
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

      const hideFields = ['party', 'for'];

      if (!fyo.singles.AccountingSettings?.enableInvoiceReturns) {
        hideFields.push('paymentType');
      }

      if (doc.schemaName === ModelNameEnum.SalesInvoice) {
        hideFields.push('account');
      } else {
        hideFields.push('paymentAccount');
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
      const returnDoc =
        doc instanceof StockTransfer
          ? await doc.getReturnDoc()
          : await getMappedDoc(doc, doc.schemaName, 'make_return');

      if (!returnDoc || !returnDoc.name) {
        return;
      }

      const { routeTo } = await import('src/utils/ui');
      const path = `/edit/${doc.schemaName}/${returnDoc.name}`;
      await routeTo(path);
    },
  };
}

export function getTransactionStatusColumn(invoice = true): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    options: (invoice
      ? [
          'Saved',
          'Unpaid',
          'PartlyPaid',
          'Paid',
          'Return',
          'ReturnIssued',
          'Cancelled',
        ]
      : ['Saved', 'Submitted', 'Return', 'ReturnIssued', 'Cancelled']
    ).map((value) => ({ value, label: getStatusText(value as InvoiceStatus) })),
    badge(doc) {
      const status = getDocStatus(doc) as InvoiceStatus;
      return {
        color: statusColor[status] ?? 'gray',
        label: getStatusText(status),
      };
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
        color: statusColor[status] ?? 'gray',
        label: getStatusTextOfLead(status),
      };
    },
  };
}

export const statusColor: Record<
  DocStatus | InvoiceStatus | LeadStatus,
  string | undefined
> = {
  '': 'gray',
  Draft: 'gray',
  Open: 'gray',
  Replied: 'yellow',
  Opportunity: 'yellow',
  Unpaid: 'orange',
  Paid: 'green',
  PartlyPaid: 'yellow',
  Interested: 'yellow',
  Converted: 'green',
  Quotation: 'green',
  Saved: 'blue',
  NotSaved: 'gray',
  Submitted: 'green',
  Cancelled: 'red',
  DonotContact: 'red',
  Return: 'lime',
  ReturnIssued: 'lime',
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

  return getSubmittableDocStatus(doc);
}

function getSubmittableDocStatus(doc: RenderData | Doc) {
  if (
    [ModelNameEnum.SalesInvoice, ModelNameEnum.PurchaseInvoice].includes(
      doc.schema.name as ModelNameEnum
    )
  ) {
    return getInvoiceStatus(doc);
  }

  if (
    [ModelNameEnum.Shipment, ModelNameEnum.PurchaseReceipt].includes(
      doc.schema.name as ModelNameEnum
    )
  ) {
    if (!!doc.returnAgainst && doc.submitted && !doc.cancelled) {
      return 'Return';
    }

    if (doc.isReturned && doc.submitted && !doc.cancelled) {
      return 'ReturnIssued';
    }
  }

  /**
   * SalesQuote extends Invoice but should never show payment-related
   * statuses (Paid, Unpaid, etc.) since quotes cannot be paid.
   * Return early with simple submitted/cancelled/saved statuses.
   */
  if (!!doc.submitted && !doc.cancelled) {
    return 'Submitted';
  }

  if (!!doc.submitted && !!doc.cancelled) {
    return 'Cancelled';
  }

  return 'Saved';
}

export function getInvoiceStatus(doc: RenderData | Doc): InvoiceStatus {
  if (doc.submitted && !doc.cancelled && doc.returnAgainst) {
    return 'Return';
  }

  if (doc.submitted && !doc.cancelled && doc.isReturned) {
    return 'ReturnIssued';
  }

  if (
    doc.submitted &&
    !doc.cancelled &&
    (doc.outstandingAmount as Money).isZero()
  ) {
    return 'Paid';
  }

  if (
    doc.submitted &&
    !doc.cancelled &&
    (doc.outstandingAmount as Money).eq(doc.baseGrandTotal as Money)
  ) {
    return 'Unpaid';
  }

  if (doc.cancelled) {
    return 'Cancelled';
  }

  if (
    doc.submitted &&
    !doc.isCancelled &&
    (doc.outstandingAmount as Money).isPositive() &&
    (doc.outstandingAmount as Money).neq(doc.baseGrandTotal as Money)
  ) {
    return 'PartlyPaid';
  }

  return 'Saved';
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
        color: serialNumberStatusColor[status] ?? 'gray',
        label: getSerialNumberStatusText(status),
      };
    },
  };
}

export const serialNumberStatusColor: Record<string, string | undefined> = {
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

      return { color: 'gray', label };
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
        return { color: 'green', label: t`Enabled` };
      }

      return { color: 'orange', label: t`Disabled` };
    },
  };
}

export async function getExchangeRate({
  fromCurrency,
  toCurrency,
  date,
}: {
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}) {
  if (!fetch) {
    return 1;
  }

  if (!date) {
    date = DateTime.local().toISODate();
  }

  const cacheKey = `currencyExchangeRate:${date}:${fromCurrency}:${toCurrency}`;

  let exchangeRate = 0;
  if (localStorage) {
    exchangeRate = safeParseFloat(localStorage.getItem(cacheKey) as string);
  }

  if (exchangeRate && exchangeRate !== 1) {
    return exchangeRate;
  }

  try {
    const res = await fetch(
      `https://api.vatcomply.com/rates?date=${date}&base=${fromCurrency}&symbols=${toCurrency}`
    );
    const data = (await res.json()) as {
      base: string;
      data: string;
      rates: Record<string, number>;
    };
    exchangeRate = data.rates[toCurrency];
  } catch (error) {
    exchangeRate ??= 1;
  }

  if (localStorage) {
    localStorage.setItem(cacheKey, String(exchangeRate));
  }

  return exchangeRate;
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
  const numberSeriesKey = numberSeriesDefaultsMap[schemaName];
  if (!numberSeriesKey) {
    return undefined;
  }

  const defaults = fyo.singles.Defaults;
  const field = fyo.getField(schemaName, 'numberSeries');
  const value = defaults?.[numberSeriesKey] as string | undefined;
  return value ?? (field?.default as string | undefined);
}

export function getDocStatusListColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    options: ['Saved', 'Submitted', 'Cancelled'].map((value) => ({
      value,
      label: getStatusText(value as DocStatus),
    })),
    badge(doc) {
      const status = getDocStatus(doc);
      return {
        color: statusColor[status] ?? 'gray',
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
    options: ['Active', 'Expired', 'Maxed'].map((value) => ({
      value,
      label: getLoyaltyProgramStatusText(value),
    })),
    badge(doc) {
      const status = getLoyaltyProgramStatus(doc);
      return {
        color: loyaltyProgramStatusColor[status] ?? 'gray',
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

export const loyaltyProgramStatusColor: Record<string, string | undefined> = {
  Active: 'green',
  Disabled: 'gray',
  Expired: 'red',
  Maxed: 'orange',
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
export async function addItem<M extends ModelsWithItems>(name: string, doc: M) {
  if (!doc.canEdit) {
    return;
  }

  const items = (doc.items ?? []) as NonNullable<M['items']>[number][];

  let item = items.find((i) => i.item === name);
  if (item) {
    const q = item.quantity ?? 0;
    await item.set('quantity', q + 1);
    return;
  }

  await doc.append('items');
  item = doc.items?.at(-1);
  if (!item) {
    return;
  }

  await item.set('item', name);

  if (doc instanceof Invoice && !doc.isSales) {
    const batchName = await generateBatchForItem(doc.fyo, name);
    if (batchName) {
      await item.set('batch', batchName);
    }
  }

  if (
    doc instanceof StockTransfer &&
    doc.schemaName === ModelNameEnum.PurchaseReceipt
  ) {
    const serialNumbers = await generateSerialNumbersForItem(doc.fyo, name, 1);
    if (serialNumbers) {
      await item.set('serialNumber', serialNumbers);
    }
  }
}

export async function validateQty(
  sinvDoc: SalesInvoice,
  item: Item | SalesInvoiceItem | POSItem | undefined,
  existingItems: InvoiceItem[]
) {
  if (!item) {
    return;
  }

  let itemName = item.name as string;
  const itemhasBatch = await sinvDoc.fyo.getValue(
    ModelNameEnum.Item,
    item.item as string,
    'hasBatch'
  );

  const itemQtyMap: ItemQtyMap = await getItemQtyMap(sinvDoc);

  if (item instanceof SalesInvoiceItem) {
    itemName = item.item as string;
  }

  if (itemhasBatch) {
    if (!item.batch) {
      throw new ValidationError(t`Please select a batch first`);
    }
  }

  const trackItem = await sinvDoc.fyo.getValue(
    ModelNameEnum.Item,
    item.item as string,
    'trackItem'
  );

  if (!trackItem) {
    return;
  }

  if (!itemQtyMap[itemName] || itemQtyMap[itemName].availableQty === 0) {
    throw new ValidationError(t`Item ${itemName} has Zero Quantity`);
  }

  if (item.batch) {
    if (
      (existingItems && !itemQtyMap[itemName]) ||
      itemQtyMap[itemName][item.batch as string] <
        (existingItems[0]?.quantity as number)
    ) {
      throw new ValidationError(
        t`Item ${itemName} only has ${
          itemQtyMap[itemName][item.batch as string]
        } Quantity in batch ${item.batch as string}`
      );
    }
  } else {
    if (
      (existingItems && !itemQtyMap[itemName]) ||
      itemQtyMap[itemName].availableQty < (existingItems[0]?.quantity as number)
    ) {
      throw new ValidationError(
        t`Item ${itemName} only has ${itemQtyMap[itemName].availableQty} Quantity`
      );
    }
  }

  return;
}
