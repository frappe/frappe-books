import {
  Action,
  BadgeData,
  BadgeTheme,
  ColumnConfig,
  RenderData,
} from 'fyo/model/types';
import { Fyo, t } from 'fyo';
import type { DocValue } from 'fyo/core/types';
import { OptionField, Schema } from 'schemas/types';
import { ModelNameEnum } from './types';

import type { FrappeDoc } from 'src/frappe/document';
import type { Invoice as InvoiceDoc } from './invoices/Invoice';
import { Money } from 'pesa';
import { Router } from 'vue-router';
import type { DocValues } from 'src/frappe/api';
import { getDocType } from 'src/frappe/doctypes';
import { getMappedFrappeDoc, getMapperValues } from 'src/frappe/documents';
import { toFrappeValue } from 'src/frappe/values';
import { DateTime } from 'luxon';

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
  source: FrappeDoc,
  schemaName: string,
  mapper: string
): Promise<FrappeDoc> {
  const method = getMapperMethod(source.schemaName, mapper);
  return await getMappedFrappeDoc(schemaName, method, source.name!);
}

/** What a server mapper builds from the `sourceSchemaName` document `sourceName`, in Frappe fieldnames. */
export async function getMappedValues(
  sourceSchemaName: string,
  sourceName: string,
  mapper: string
): Promise<DocValues> {
  const method = getMapperMethod(sourceSchemaName, mapper);
  return await getMapperValues(method, sourceName);
}

function getMapperMethod(sourceSchemaName: string, mapper: string) {
  return `${MAPPER_MODULES[sourceSchemaName]}.${mapper}`;
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
  // A return refunds, so a sales return pays and a purchase return receives.
  const nextStep = (doc: FrappeDoc) =>
    (schemaName === ModelNameEnum.SalesInvoice) !== !!doc.return_against
      ? fyo.t`Receive Payment`
      : fyo.t`Make Payment`;

  return [
    { ...getMakePaymentAction(fyo), nextStep },
    getMakeStockTransferAction(fyo, schemaName),
    getLedgerLinkAction(fyo),
    getMakeReturnDocAction(fyo),
  ];
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
    condition: (doc: FrappeDoc) => doc.isSubmitted && !!doc.stock_not_transferred,
    action: async (doc: FrappeDoc) => {
      const invoice = doc as InvoiceDoc;
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
    condition: (doc: FrappeDoc) => {
      // Quotes to leads are not invoiced.
      if (schemaName === ModelNameEnum.SalesQuote) {
        return doc.isSubmitted && doc.reference_type === 'Books Party';
      }

      // Shipments and receipts are Frappe-backed.
      return (
        doc.isSubmitted &&
        !doc.back_reference &&
        !doc.return_against &&
        !doc.is_fully_billed
      );
    },
    action: async (doc: FrappeDoc) => {
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
    condition: (doc: FrappeDoc) => !doc.notInserted,
    action: async (doc: FrappeDoc, router) => {
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
    condition: (doc: FrappeDoc) => !doc.notInserted,
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
    condition: (doc: FrappeDoc) =>
      doc.isSubmitted && !(doc.outstanding_amount as Money).isZero(),
    action: async (doc, router) => {
      const payment = await getMappedDoc(
        doc,
        ModelNameEnum.Payment,
        'make_payment'
      );
      const currentRoute = router.currentRoute.value.fullPath;
      payment.once('afterSubmit', async () => {
        await doc.load();
        await router.push(currentRoute);
      });

      // The party account comes from the invoice.
      const hideFields = ['party', 'payment_references', 'account'];

      if (!fyo.singles.AccountingSettings?.enable_invoice_returns) {
        hideFields.push('payment_type');
      }

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
    condition: (doc: FrappeDoc) => doc.isSubmitted,
    action: async (doc: FrappeDoc, router: Router) => {
      const route = getLedgerLink(doc, reportClassName);
      await router.push(route);
    },
  };
}

/** The report of the document's entries, which all post on its date. */
export function getLedgerLink(
  doc: FrappeDoc,
  reportClassName: 'GeneralLedger' | 'StockLedger'
) {
  const date = getPostingDate(doc);
  return {
    name: 'Report',
    params: {
      reportClassName,
    },
    query: {
      defaultFilters: JSON.stringify({
        referenceType: getDocType(doc.schemaName).doctype,
        referenceName: doc.name,
        fromDate: date,
        toDate: date,
      }),
    },
  };
}

/** Local midnight of the day, in the system time zone, the server posts the document on. */
function getPostingDate(doc: FrappeDoc): Date {
  const field = doc.fieldMap.date ?? doc.fieldMap.posting_date;
  const value = doc.get(field.fieldname) as DocValue;
  const day = String(toFrappeValue(value, field, doc.fyo)).slice(0, 10);
  return DateTime.fromISO(day).toJSDate();
}

export function getMakeReturnDocAction(fyo: Fyo): Action {
  return {
    label: fyo.t`Return`,
    group: fyo.t`Create`,
    condition: (doc: FrappeDoc) =>
      !!fyo.singles.AccountingSettings?.enable_invoice_returns &&
      doc.isSubmitted &&
      !doc.isReturn &&
      !doc.is_fully_returned,
    action: async (doc: FrappeDoc) => {
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
      const status = String(doc.status ?? '');
      return getStateBadge(doc.schema, status) ?? { label: status, theme: 'gray' };
    },
  };
}

/** Frappe UI badge themes for the colours a DocType state can have. */
const stateThemes: Record<string, BadgeTheme | undefined> = {
  Blue: 'blue',
  Cyan: 'blue',
  'Light Blue': 'blue',
  Gray: 'gray',
  Green: 'green',
  Orange: 'amber',
  Yellow: 'amber',
  Red: 'red',
  Pink: 'red',
  Purple: 'violet',
};

/** A stored status as its `status` option labels it and its DocType state colours it. */
export function getStateBadge(
  schema: Schema | undefined,
  status: string
): BadgeData | undefined {
  const field = schema?.fields.find(({ fieldname }) => fieldname === 'status');
  const color = (field as OptionField | undefined)?.states?.[status];
  if (!color) {
    return undefined;
  }

  const option = (field as OptionField).options.find(
    ({ value }) => value === status
  );
  return { label: option?.label ?? status, theme: stateThemes[color] ?? 'gray' };
}

/** Unsaved and docstatus badges, which Frappe's desk also draws without states. */
function getDocstatusBadge(status: string): BadgeData {
  switch (status) {
    case 'Draft':
      return { label: t`Draft`, theme: 'gray' };
    case 'NotSaved':
      // Frappe's desk shows Not Saved in orange; amber is frappe-ui's nearest.
      return { label: t`Not Saved`, theme: 'amber' };
    case 'Saved':
      return { label: t`Saved`, theme: 'blue' };
    case 'Submitted':
      return { label: t`Submitted`, theme: 'green' };
    case 'Cancelled':
      return { label: t`Cancelled`, theme: 'red' };
    default:
      return { label: status, theme: 'gray' };
  }
}

export function getDocStatusBadge(doc: RenderData | FrappeDoc): BadgeData {
  const status = getDocStatus(doc);
  return getStateBadge(doc.schema, status) ?? getDocstatusBadge(status);
}

export function getDocStatus(doc?: RenderData | FrappeDoc): string {
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
    return doc.status as string;
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
      const status = typeof doc.status === 'string' ? doc.status : 'Inactive';
      return getStateBadge(doc.schema, status) ?? { label: status, theme: 'gray' };
    },
  };
}

export function getPriceListStatusColumn(): ColumnConfig {
  return {
    label: t`Enabled For`,
    fieldname: 'enabledFor',
    fieldtype: 'Select',
    badge({ is_sales: isSales, is_purchase: isPurchase }) {
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
      if (doc.is_enabled) {
        return { theme: 'green', label: t`Enabled` };
      }

      return { theme: 'amber', label: t`Disabled` };
    },
  };
}

export function getDocStatusListColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge: getDocStatusBadge,
  };
}

export function getLoyaltyProgramStatusColumn(): ColumnConfig {
  return {
    label: t`Status`,
    fieldname: 'status',
    fieldtype: 'Select',
    badge: (doc) => getLoyaltyProgramBadge(doc),
  };
}

export function getLoyaltyProgramBadge(doc: RenderData | FrappeDoc): BadgeData {
  const status = doc.status as string;
  return (
    getStateBadge(doc.schema, status) ?? { theme: 'gray', label: status ?? '' }
  );
}

/** Adds `quantity` of an item to a document's rows, to its row of the item if it has one. */
export async function addItem(name: string, doc: FrappeDoc, quantity = 1) {
  if (!doc.canEdit) {
    return;
  }

  const rows = (doc.items ?? []) as FrappeDoc[];
  const row = rows.find((existing) => existing.item === name);
  if (row) {
    await row.set('quantity', ((row.quantity as number) ?? 0) + quantity);
    return;
  }

  await doc.append('items');
  const added = (doc.items as FrappeDoc[] | undefined)?.at(-1);
  if (!added) {
    return;
  }

  await added.set('item', name);
  if (quantity !== 1) {
    await added.set('quantity', quantity);
  }
}
