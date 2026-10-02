/**
 * Utils to do UI stuff such as opening dialogs, toasts, etc.
 * Basically anything that may directly or indirectly import a Vue file.
 */
import { t } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { getActions } from 'fyo/utils';
import { ValueError } from 'fyo/utils/errors';
import { getLedgerLink } from 'models/helpers';
import { getInsufficientItems } from 'models/inventory/insufficientStock';
import { Invoice } from 'models/invoices/Invoice';
import { PurchaseInvoice } from 'models/invoices/PurchaseInvoice';
import { SalesInvoice } from 'models/invoices/SalesInvoice';
import { ModelNameEnum } from 'models/types';
import { Schema } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getCount, type Filter } from 'src/frappe/api';
import { getModel } from 'src/frappe/registry';
import { newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import router from 'src/router';
import { call } from 'src/web/api';
import { assertIsType } from 'utils/index';
import type { LinkedDoc } from 'utils/db/types';
import { SelectFileOptions } from 'utils/types';
import { RouteLocationRaw } from 'vue-router';
import { evaluateHidden } from './doc';
import { selectFile } from './browser';
import { showDialog, showToast } from './interactive';
import { showSidebar } from './refs';
import {
  ActionGroup,
  QuickEditOptions,
  SettingsTab,
  ToastOptions,
  UIGroupedFields,
} from './types';

export const toastDurationMap = {
  short: 2_500,
  long: 5_000,
  very_long: Infinity,
} as const;

export async function openQuickEdit({
  doc,
  hideFields = [],
  showFields = [],
}: QuickEditOptions) {
  const { schemaName, name } = doc;
  if (!name) {
    throw new ValueError(t`Quick edit error: ${schemaName} entry has no name.`);
  }

  const currentQuery = router.currentRoute.value.query;
  if (
    currentQuery.edit &&
    currentQuery.schemaName === schemaName &&
    currentQuery.name === name
  ) {
    return;
  }

  const query = {
    ...currentQuery,
    edit: 1,
    name,
    schemaName,
    showFields,
    hideFields,
  };
  // New linked records need a history entry to return to their parent form.
  const replace = !!currentQuery.edit && !doc.notInserted;
  await router.push({ query, replace });
}

/** Desktop shows settings in a dialog, phones on a page (see the router). */
export async function openSettings(tab?: SettingsTab) {
  await routeTo({ path: '/settings', query: tab ? { tab } : {} });
}

export async function routeTo(route: RouteLocationRaw) {
  if (
    typeof route === 'string' &&
    route === router.currentRoute.value.fullPath
  ) {
    return;
  }

  return await router.push(route);
}

export async function deleteDocWithPrompt(doc: FrappeDoc) {
  let detail = t`This action is permanent.`;
  // A submitted document cannot be deleted; a cancelled one takes its entries along.
  const hasEntries =
    doc.isTransactional || stockSchemas.includes(doc.schemaName);
  if (hasEntries && doc.isCancelled) {
    detail = t`This action is permanent and will delete associated ledger entries.`;
  }

  return (await showDialog({
    title: t`Delete ${getDocReferenceLabel(doc)}?`,
    detail,
    destructive: true,
    buttons: [
      {
        label: t`Delete`,
        async action() {
          try {
            await doc.delete();
          } catch (err) {
            await handleErrorWithDialog(err as Error, doc);
            return false;
          }

          return true;
        },
        isPrimary: true,
      },
      {
        label: t`Keep ${getDocTypeLabel(doc)}`,
        action() {
          return false;
        },
        isEscape: true,
      },
    ],
  })) as boolean;
}

export async function cancelDocWithPrompt(doc: FrappeDoc) {
  let payments: LinkedDoc[] = [];
  if (['SalesInvoice', 'PurchaseInvoice'].includes(doc.schemaName)) {
    payments = await getInvoicePayments(doc);
  }

  return (await showDialog({
    title: t`Cancel ${getDocReferenceLabel(doc)}?`,
    detail: getCancelDetail(payments),
    type: 'warning',
    // Buttons name the outcome: "Cancel" alone could mean either answer.
    buttons: [
      {
        label: t`Cancel ${getDocTypeLabel(doc)}`,
        async action() {
          try {
            await doc.cancel(payments);
          } catch (err) {
            await handleErrorWithDialog(err as Error, doc);
            return false;
          }

          return true;
        },
        isPrimary: true,
      },
      {
        label: t`Keep ${getDocTypeLabel(doc)}`,
        action() {
          return false;
        },
        isEscape: true,
      },
    ],
  })) as boolean;
}

/** The submitted payments that cancelling the invoice `doc` also cancels. */
async function getInvoicePayments(doc: FrappeDoc): Promise<LinkedDoc[]> {
  return await call('frappe_books.accounting.invoice.get_payments_to_cancel', {
    doctype: fyo.store.permissions?.doctypes[doc.schemaName],
    name: doc.name,
  });
}

function getCancelDetail(payments: LinkedDoc[]): string {
  const names = payments.map(({ name }) => name).join(', ');
  if (!payments.length) {
    return t`This action is permanent`;
  }

  if (payments.length === 1) {
    return t`This action is permanent and will cancel the following payment: ${names}`;
  }

  return t`This action is permanent and will cancel the following payments: ${names}`;
}

export function getActionsForDoc(doc?: FrappeDoc): Action[] {
  if (!doc) return [];

  const actions: Action[] = [
    ...getActions(doc),
    getDuplicateAction(doc),
    getNewAction(doc),
    getDeleteAction(doc),
    getCancelAction(doc),
  ];

  if (doc?.schemaName === 'Party') {
    const viewActions = getViewActions(doc);
    actions.push(...viewActions);
  }

  return actions
    .filter((d) => d.condition?.(doc) ?? true)
    .map((d) => {
      return {
        group: d.group,
        label: d.label,
        theme: d.theme,
        action: d.action,
        nextStep: d.nextStep,
      };
    });
}

export function getGroupedActionsForDoc(doc?: FrappeDoc): ActionGroup[] {
  const actions = getActionsForDoc(doc);
  const actionsMap = actions.reduce(
    (acc, ac) => {
      if (!ac.group) {
        ac.group = '';
      }

      acc[ac.group] ??= {
        group: ac.group,
        label: ac.label ?? '',
        type: ac.type ?? 'secondary',
        actions: [],
      };

      acc[ac.group].actions.push(ac);
      return acc;
    },
    {} as Record<string, ActionGroup>,
  );

  const grouped = Object.keys(actionsMap)
    .filter(Boolean)
    .sort()
    .map((k) => actionsMap[k]);

  return [grouped, actionsMap['']].flat().filter(Boolean);
}

function getViewActions(doc: FrappeDoc): Action[] {
  const actions: Action[] = [
    {
      label: t`General Ledger`,
      group: t`View`,
      condition: (doc: FrappeDoc) =>
        doc.schemaName === 'Party' && doc.inserted,
      action: async () => {
        await router.push({
          path: '/report/GeneralLedger',
          query: {
            defaultFilters: JSON.stringify({
              party: doc.name,
            }),
          },
        });
      },
    },
  ];
  return actions;
}

function getCancelAction(doc: FrappeDoc): Action {
  return {
    label: t`Cancel`,
    theme: 'red',
    condition: (doc: FrappeDoc) => doc.canCancel,
    async action() {
      await commonDocCancel(doc);
    },
  };
}

function getDeleteAction(doc: FrappeDoc): Action {
  return {
    label: t`Delete`,
    theme: 'red',
    condition: (doc: FrappeDoc) => doc.canDelete,
    async action() {
      await commonDocDelete(doc);
    },
  };
}

async function openEdit({ name, schemaName }: FrappeDoc) {
  if (!name) {
    return;
  }

  const route = getFormRoute(schemaName, name);
  return await routeTo(route);
}

function getDuplicateAction(doc: FrappeDoc): Action {
  const isSubmittable = !!doc.schema.isSubmittable;
  return {
    label: t`Duplicate`,
    group: t`Create`,
    condition: (doc: FrappeDoc) =>
      !!(
        ((isSubmittable && doc.submitted) || !isSubmittable) &&
        !doc.notInserted &&
        fyo.can(doc.schemaName, 'create')
      ),
    async action() {
      try {
        const dupe = await doc.duplicate();
        await openEdit(dupe);
      } catch (err) {
        await handleErrorWithDialog(err as Error, doc);
      }
    },
  };
}

function getNewAction(doc: FrappeDoc): Action {
  return {
    label: t`New Entry`,
    group: t`Create`,
    condition: (doc: FrappeDoc) => fyo.can(doc.schemaName, 'create'),
    async action() {
      try {
        const newDoc = newFrappeDoc(doc.schemaName);
        await openEdit(newDoc);
      } catch (err) {
        await handleErrorWithDialog(err as Error, doc);
      }
    },
  };
}

export function getFieldsGroupedByTabAndSection(
  schema: Schema,
  doc: FrappeDoc,
): UIGroupedFields {
  const grouped: UIGroupedFields = new Map();
  for (const field of doc.getFormFields(schema?.fields ?? [])) {
    const tab = field.tab ?? 'Main';
    const section = field.section ?? 'Default';
    if (!grouped.has(tab)) {
      grouped.set(tab, new Map());
    }

    const tabbed = grouped.get(tab)!;
    if (!tabbed.has(section)) {
      tabbed.set(section, []);
    }

    if (field.meta) {
      continue;
    }

    if (evaluateHidden(field, doc)) {
      continue;
    }

    tabbed.get(section)!.push(field);
  }

  // Delete empty tabs and sections
  for (const tkey of grouped.keys()) {
    const section = grouped.get(tkey);
    if (!section) {
      grouped.delete(tkey);
      continue;
    }

    for (const skey of section.keys()) {
      const fields = section.get(skey);
      if (!fields || !fields.length) {
        section.delete(skey);
      }
    }

    if (!section?.size) {
      grouped.delete(tkey);
    }
  }

  return grouped;
}

export function getFormRoute(schemaName: string, name: string): string {
  const route = getModel(schemaName)
    ?.getListViewSettings(fyo)
    ?.formRoute?.(name);

  if (typeof route === 'string') {
    return route;
  }

  // Use `encodeURIComponent` if more name issues
  return `/edit/${schemaName}/${name.replaceAll('/', '%2F')}`;
}

export async function openNewDoc(schemaName: string, initData?: DocValueMap) {
  const doc = newFrappeDoc(schemaName, initData);
  await routeTo(getFormRoute(schemaName, doc.name!));
}

export async function isPrintable(schemaName: string) {
  const doctype = fyo.store.permissions?.doctypes[schemaName];
  if (!doctype) {
    return false;
  }

  const filters: Filter[] = [
    ['doc_type', '=', doctype],
    ['disabled', '=', 0],
  ];
  return (await getCount('Print Format', filters, [])) > 0;
}

export function toggleSidebar(value?: boolean) {
  if (typeof value !== 'boolean') {
    value = !showSidebar.value;
  }

  showSidebar.value = value;
}

export function focusOrSelectFormControl(
  doc: FrappeDoc,
  ref: unknown,
  shouldClear = true,
) {
  if (!doc?.fyo) {
    return;
  }

  if (doc.schema.naming !== 'manual' || doc.inserted) {
    return;
  }

  if (!doc.fyo.isTemporaryName(doc.name ?? '', doc.schema)) {
    return;
  }

  if (Array.isArray(ref) && ref.length > 0) {
    ref = ref[0];
  }

  if (
    !ref ||
    typeof ref !== 'object' ||
    !assertIsType<Record<string, () => void>>(ref)
  ) {
    return;
  }

  if (!shouldClear && typeof ref?.select === 'function') {
    ref.select();
    return;
  }

  if (typeof ref?.clear === 'function') {
    ref.clear();
  }

  if (typeof ref?.focus === 'function') {
    ref.focus();
  }

  doc.name = '';
}

export async function selectTextFile(filters?: SelectFileOptions['filters']) {
  const options = {
    title: t`Select File`,
    filters,
  };
  const selectedFile = await selectFile(options);

  if (!selectedFile) {
    showToast({
      type: 'error',
      message: t`File selection failed`,
    });
    return {};
  }

  const text = new TextDecoder().decode(selectedFile.data);
  if (!text) {
    showToast({
      type: 'error',
      message: t`Empty file selected`,
    });

    return {};
  }

  return {
    text,
    filePath: selectedFile.name,
    name: selectedFile.name,
  };
}

export enum ShortcutKey {
  enter = 'enter',
  ctrl = 'ctrl',
  pmod = 'pmod',
  shift = 'shift',
  alt = 'alt',
  delete = 'delete',
  esc = 'esc',
}

export async function commonDocDelete(
  doc: FrappeDoc,
  routeBack = true,
): Promise<boolean> {
  const res = await deleteDocWithPrompt(doc);
  if (!res) {
    return false;
  }

  showActionToast(doc, 'delete');
  if (routeBack) {
    router.back();
  }
  return true;
}

export async function commonDocCancel(doc: FrappeDoc): Promise<boolean> {
  const res = await cancelDocWithPrompt(doc);
  if (!res) {
    return false;
  }

  showActionToast(doc, 'cancel');
  return true;
}

export async function commonDocSync(
  doc: FrappeDoc,
  useDialog = false,
): Promise<boolean> {
  let success: boolean;
  if (useDialog) {
    success = !!(await showSubmitOrSyncDialog(doc, 'sync'));
  } else {
    success = await syncWithoutDialog(doc);
  }

  if (!success) {
    return false;
  }

  showActionToast(doc, 'sync');
  return true;
}

async function syncWithoutDialog(doc: FrappeDoc): Promise<boolean> {
  try {
    await doc.sync();
  } catch (error) {
    await handleErrorWithDialog(error, doc);
    return false;
  }

  return true;
}

export async function commonDocSubmit(doc: FrappeDoc): Promise<boolean> {
  if (
    doc instanceof SalesInvoice &&
    !(await showInsufficientInventoryDialog(doc))
  ) {
    return false;
  }

  const success = await showSubmitOrSyncDialog(doc, 'submit');
  if (!success) {
    return false;
  }

  showSubmitToast(doc);
  return true;
}

/** The server refuses the shipment of short stock, so Yes submits without it. */
async function showInsufficientInventoryDialog(doc: SalesInvoice) {
  if (!doc.make_auto_stock_transfer) {
    return true;
  }

  const insufficient = await getInsufficientItems(doc);
  if (insufficient.length) {
    const buttons = [
      {
        label: t`Yes`,
        action: async () => await doc.set('make_auto_stock_transfer', false),
        isPrimary: true,
      },
      {
        label: t`No`,
        action: () => false,
        isEscape: true,
      },
    ];

    const list = insufficient
      .map(({ item, quantity }) => `${item} (${quantity})`)
      .join(', ');
    const detail = [
      t`The following items have insufficient quantity for Shipment: ${list}`,
      t`Continue submitting Sales Invoice?`,
    ];

    return (await showDialog({
      title: t`Insufficient Quantity`,
      type: 'warning',
      detail,
      buttons,
    })) as boolean;
  }

  return true;
}

async function showSubmitOrSyncDialog(doc: FrappeDoc, type: 'submit' | 'sync') {
  const label = getDocReferenceLabel(doc);
  let title = t`Save ${label}?`;
  if (type === 'submit') {
    title = t`Submit ${label}?`;
  }

  let detail: string;
  if (type === 'submit') {
    detail = getDocSubmitMessage(doc);
  } else {
    detail = getDocSyncMessage(doc);
  }

  let actionError: unknown;
  const yesAction = async () => {
    try {
      await doc[type]();
    } catch (error) {
      actionError = error;
      return false;
    }

    return true;
  };

  const buttons = [
    {
      label: t`Yes`,
      action: yesAction,
      isPrimary: true,
    },
    {
      label: t`No`,
      action: () => false,
      isEscape: true,
    },
  ];

  const dialogOptions = {
    title,
    detail,
    buttons,
  };

  const success = (await showDialog(dialogOptions)) as boolean;
  if (actionError) {
    // Show the error after the confirmation closes so it cannot offer a stale retry.
    await handleErrorWithDialog(actionError, doc, true);
  }

  return success;
}

function getDocSyncMessage(doc: FrappeDoc): string {
  const label = getDocReferenceLabel(doc);
  const detail = t`Create new ${doc.schema.label} entry?`;
  if (doc.inserted) {
    return t`Save changes made to ${label}?`;
  }

  if (doc instanceof Invoice && doc.grand_total?.isZero()) {
    const gt = doc.fyo.format(doc.grand_total ?? doc.fyo.pesa(0), 'Currency');
    return [
      detail,
      t`Entry has Grand Total ${gt}. Please verify amounts.`,
    ].join(' ');
  }

  return detail;
}

function getDocSubmitMessage(doc: FrappeDoc): string {
  const details = [t`Mark ${doc.schema.label} as submitted?`];

  if (doc instanceof SalesInvoice && doc.make_auto_payment) {
    const toAccount = doc.autoPaymentAccount!;
    const fromAccount = doc.account!;
    const amount = fyo.format(doc.outstanding_amount, 'Currency');

    details.push(
      t`Payment of ${amount} will be made from account "${fromAccount}" to account "${toAccount}" on Submit.`,
    );
  } else if (doc instanceof PurchaseInvoice && doc.make_auto_payment) {
    const fromAccount = doc.autoPaymentAccount!;
    const toAccount = doc.account!;
    const amount = fyo.format(doc.outstanding_amount, 'Currency');

    details.push(
      t`Payment of ${amount} will be made from account "${fromAccount}" to account "${toAccount}" on Submit.`,
    );
  }

  return details.join(' ');
}

function showActionToast(doc: FrappeDoc, type: 'sync' | 'cancel' | 'delete') {
  const label = getDocReferenceLabel(doc);
  const message = {
    sync: t`${label} saved`,
    cancel: t`${label} cancelled`,
    delete: t`${label} deleted`,
  }[type];

  showToast({ type: 'success', message, duration: 'short' });
}

function showSubmitToast(doc: FrappeDoc) {
  const label = getDocReferenceLabel(doc);
  const message = t`${label} submitted`;
  const toastOption: ToastOptions = {
    type: 'success',
    message,
    duration: 'long',
    ...getSubmitSuccessToastAction(doc),
  };
  showToast(toastOption);
}

// Documents that move stock; their submit toast opens their stock entries.
const stockSchemas: string[] = [
  ModelNameEnum.StockMovement,
  ModelNameEnum.Shipment,
  ModelNameEnum.PurchaseReceipt,
];

function getSubmitSuccessToastAction(doc: FrappeDoc) {
  const isStockTransfer = stockSchemas.includes(doc.schemaName);

  if (isStockTransfer) {
    return {
      async action() {
        const route = getLedgerLink(doc, 'StockLedger');
        await routeTo(route);
      },
      actionText: t`View Stock Entries`,
    };
  }

  if (doc.isTransactional) {
    return {
      async action() {
        const route = getLedgerLink(doc, 'GeneralLedger');
        await routeTo(route);
      },
      actionText: t`View Accounting Entries`,
    };
  }

  return {};
}

export function showCannotSaveOrSubmitToast(doc: FrappeDoc) {
  const label = getDocReferenceLabel(doc);
  let message = t`${label} already saved`;

  if (doc.schema.isSubmittable && doc.isSubmitted) {
    message = t`${label} already submitted`;
  }

  showToast({ type: 'warning', message, duration: 'short' });
}

export function showCannotCancelOrDeleteToast(doc: FrappeDoc) {
  const label = getDocReferenceLabel(doc);
  let message = t`${label} cannot be deleted`;
  if (doc.schema.isSubmittable && !doc.isCancelled) {
    message = t`${label} cannot be cancelled`;
  }

  showToast({ type: 'warning', message, duration: 'short' });
}

function getDocTypeLabel(doc: FrappeDoc) {
  return doc.schema.label || doc.schemaName;
}

function getDocReferenceLabel(doc: FrappeDoc) {
  const label = getDocTypeLabel(doc);
  if (doc.schema.naming === 'random') {
    return label;
  }

  return doc.name || label;
}

export const printSizes = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
  'B0',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B7',
  'B8',
  'B9',
  'POS',
  'Letter',
  'Legal',
  'Executive',
  'C5E',
  'Comm10',
  'DLE',
  'Folio',
  'Ledger',
  'Tabloid',
  'Custom',
] as const;

export const paperSizeMap: Record<
  (typeof printSizes)[number],
  { width: number; height: number }
> = {
  A0: {
    width: 84.1,
    height: 118.9,
  },
  A1: {
    width: 59.4,
    height: 84.1,
  },
  A2: {
    width: 42,
    height: 59.4,
  },
  A3: {
    width: 29.7,
    height: 42,
  },
  A4: {
    width: 21,
    height: 29.7,
  },
  A5: {
    width: 14.8,
    height: 21,
  },
  A6: {
    width: 10.5,
    height: 14.8,
  },
  A7: {
    width: 7.4,
    height: 10.5,
  },
  A8: {
    width: 5.2,
    height: 7.4,
  },
  A9: {
    width: 3.7,
    height: 5.2,
  },
  B0: {
    width: 100,
    height: 141.4,
  },
  B1: {
    width: 70.7,
    height: 100,
  },
  B2: {
    width: 50,
    height: 70.7,
  },
  B3: {
    width: 35.3,
    height: 50,
  },
  B4: {
    width: 25,
    height: 35.3,
  },
  B5: {
    width: 17.6,
    height: 25,
  },
  B6: {
    width: 12.5,
    height: 17.6,
  },
  B7: {
    width: 8.8,
    height: 12.5,
  },
  B8: {
    width: 6.2,
    height: 8.8,
  },
  B9: {
    width: 4.4,
    height: 6.2,
  },
  POS: {
    width: 8,
    height: 22,
  },
  Letter: {
    width: 21.59,
    height: 27.94,
  },
  Legal: {
    width: 21.59,
    height: 35.56,
  },
  Executive: {
    width: 19.05,
    height: 25.4,
  },
  C5E: {
    width: 16.3,
    height: 22.9,
  },
  Comm10: {
    width: 10.5,
    height: 24.1,
  },
  DLE: {
    width: 11,
    height: 22,
  },
  Folio: {
    width: 21,
    height: 33,
  },
  Ledger: {
    width: 43.2,
    height: 27.9,
  },
  Tabloid: {
    width: 27.9,
    height: 43.2,
  },
  Custom: {
    width: -1,
    height: -1,
  },
};
