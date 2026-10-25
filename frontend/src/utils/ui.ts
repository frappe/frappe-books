/**
 * Utils to do UI stuff such as opening dialogs, toasts, etc.
 * Basically anything that may directly or indirectly import a Vue file.
 */
import { t } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { getActions } from 'fyo/utils';
import { ConflictError, ValueError } from 'fyo/utils/errors';
import { canOpenLedger, getLedgerLink } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getCount, type Filter } from 'src/frappe/api';
import { getDeskFormUrl, openInDesk } from 'src/frappe/desk';
import { isAccessoryMode } from 'src/frappe/mode';
import { getModel } from 'src/frappe/registry';
import { newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { getErrorMessage } from 'src/utils';
import router from 'src/router';
import { call } from 'src/web/api';
import { assertIsType } from 'utils/index';
import type { LinkedDoc } from 'utils/db/types';
import { SelectFileOptions } from 'utils/types';
import { RouteLocationRaw } from 'vue-router';
import { selectFile } from './browser';
import { isFieldShown } from './doc';
import {
  DEFAULT_SECTION,
  getEndTabLabel,
  sortEndTabs,
} from 'src/frappe/accessoryLayout';
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
            await handleErrorWithDialog(err as Error, doc, true);
            return false;
          }

          return true;
        },
        isPrimary: true,
      },
      {
        label: t`Keep ${doc.typeLabel}`,
        action() {
          return false;
        },
        isEscape: true,
      },
    ],
  })) as boolean;
}

export async function cancelDocWithPrompt(
  doc: FrappeDoc,
  linkedDocs: LinkedDoc[]
) {
  return (await showDialog({
    title: t`Cancel ${getDocReferenceLabel(doc)}?`,
    detail: getCancelDetail(linkedDocs),
    type: 'warning',
    // Buttons name the outcome: "Cancel" alone could mean either answer.
    buttons: [
      {
        label: t`Cancel ${doc.typeLabel}`,
        async action() {
          try {
            await doc.cancel(linkedDocs);
          } catch (err) {
            await handleErrorWithDialog(err as Error, doc, true);
            return false;
          }

          return true;
        },
        isPrimary: true,
      },
      {
        label: t`Keep ${doc.typeLabel}`,
        action() {
          return false;
        },
        isEscape: true,
      },
    ],
  })) as boolean;
}

/**
 * The submitted documents that cancelling `doc` also cancels: an invoice's
 * payments, or, in accessory mode, every submitted document linked to it,
 * as Desk's Cancel All does.
 */
async function getDocsToCancel(doc: FrappeDoc): Promise<LinkedDoc[]> {
  if (isAccessoryMode()) {
    const { docs } = await call<{ docs: LinkedDoc[] }>(
      'frappe.desk.form.linked_with.get_submitted_linked_docs',
      { doctype: doc.doctype, name: doc.name }
    );
    return docs;
  }

  if (!['SalesInvoice', 'PurchaseInvoice'].includes(doc.schemaName)) {
    return [];
  }

  return await getInvoicePayments(doc);
}

/** The submitted payments that cancelling the invoice `doc` also cancels. */
async function getInvoicePayments(doc: FrappeDoc): Promise<LinkedDoc[]> {
  return await call('frappe_books.accounting.invoice.get_payments_to_cancel', {
    doctype: fyo.store.permissions?.doctypes[doc.schemaName],
    name: doc.name,
  });
}

/**
 * Accessory mode cancels the documents linked to `doc` with it, all or
 * nothing, as Desk's Cancel All does; a failure stays in the dialog to try again.
 */
async function cancelAllWithPrompt(doc: FrappeDoc, linkedDocs: LinkedDoc[]) {
  return (await showDialog({
    title: t`Cancel ${getDocReferenceLabel(doc)}?`,
    detail: getCancelAllDetail(doc, linkedDocs),
    destructive: true,
    keepsOpenOnError: true,
    buttons: [
      {
        label: t`Cancel all`,
        async action() {
          try {
            await doc.cancel(linkedDocs);
          } catch (err) {
            const message = getErrorMessage(err as Error);
            throw new Error(`${message}\n${t`Nothing was cancelled.`}`, {
              cause: err,
            });
          }

          return true;
        },
        isPrimary: true,
      },
      { label: t`Go back`, action: () => false, isEscape: true },
    ],
  })) as boolean;
}

function getCancelAllDetail(doc: FrappeDoc, linkedDocs: LinkedDoc[]): string {
  const type = doc.typeLabel.toLowerCase();
  const rows = linkedDocs.map(
    ({ doctype, name }) => `${doctype} <b>${name}</b>`
  );
  return [
    t`Cancelling this ${type} in ERPNext also cancels every submitted document linked to it.`,
    '',
    linkedDocs.length === 1
      ? t`1 linked document will also be cancelled:`
      : t`${linkedDocs.length} linked documents will also be cancelled:`,
    ...rows,
  ].join('<br>');
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
    getOpenInERPNextAction(doc),
    getDeleteAction(doc),
    getCancelAction(doc),
  ];

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
    {} as Record<string, ActionGroup>
  );

  const grouped = Object.keys(actionsMap)
    .filter(Boolean)
    .sort()
    .map((k) => actionsMap[k]);

  return [grouped, actionsMap['']].flat().filter(Boolean);
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
        await handleErrorWithDialog(err as Error, doc, true);
      }
    },
  };
}

/** Accessory mode: a saved ERPNext document in Desk, where ERPNext's own form shows it. */
function getOpenInERPNextAction(doc: FrappeDoc): Action {
  return {
    label: t`Open in ERPNext`,
    condition: (doc: FrappeDoc) =>
      isAccessoryMode() &&
      !doc.notInserted &&
      !doc.schema.isSingle &&
      !doc.doctype.startsWith('Books '),
    action: () => openInDesk(getDeskFormUrl(doc.doctype, doc.name!)),
  };
}

function getNewAction(doc: FrappeDoc): Action {
  return {
    label: t`New entry`,
    group: t`Create`,
    // An unsaved document is already a new entry.
    condition: (doc: FrappeDoc) =>
      !doc.notInserted && fyo.can(doc.schemaName, 'create'),
    async action() {
      try {
        const newDoc = newFrappeDoc(doc.schemaName);
        await openEdit(newDoc);
      } catch (err) {
        await handleErrorWithDialog(err as Error, doc, true);
      }
    },
  };
}

export function getFieldsGroupedByTabAndSection(
  schema: Schema,
  doc: FrappeDoc
): UIGroupedFields {
  const grouped: UIGroupedFields = new Map();
  const appTabs = new Map<string, Field[]>();
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

    // Accessory mode's ERPNext fields with no Books position: More details shows these; see `extraFields.ts`.
    if (field.meta || field.moreDetails || !isFieldShown(doc, field)) {
      continue;
    }

    if (field.appTab) {
      appTabs.set(field.appTab, [...(appTabs.get(field.appTab) ?? []), field]);
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

  // Custom fields and other apps' fields follow as tabs of their own.
  for (const tab of sortEndTabs([...appTabs.keys()])) {
    grouped.set(
      getEndTabLabel(tab),
      new Map([[DEFAULT_SECTION, appTabs.get(tab)!]])
    );
  }

  return grouped;
}

/** A form's tabs; the unnamed first one reads Details, as Desk's does, once app tabs join it. */
export function getTabOptions(
  grouped: UIGroupedFields | null | undefined
): { value: string; label: string }[] {
  return [...(grouped?.keys() ?? [])].map((value) => ({
    value,
    label: value === 'Main' ? t`Details` : value,
  }));
}

export function getFormRoute(schemaName: string, name: string): string {
  const route = getModel(schemaName)
    ?.getListViewSettings(fyo)
    ?.formRoute?.(name);

  if (typeof route === 'string') {
    return route;
  }

  // ERPNext names may hold any character, like the % of "GST 18% - AR".
  return `/edit/${schemaName}/${encodeURIComponent(name)}`;
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
  shouldClear = true
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
    title: t`Select file`,
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
  routeBack = true
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
  const linkedDocs = await getDocsToCancel(doc);
  if (!isAccessoryMode() || !linkedDocs.length) {
    const cancelled = await cancelDocWithPrompt(doc, linkedDocs);
    if (cancelled) {
      showActionToast(doc, 'cancel');
    }
    return cancelled;
  }

  if (!(await cancelAllWithPrompt(doc, linkedDocs))) {
    return false;
  }

  const label = getDocReferenceLabel(doc);
  const count = linkedDocs.length;
  const message =
    count === 1
      ? t`Cancelled ${label} and 1 linked document`
      : t`Cancelled ${label} and ${count} linked documents`;
  showToast({ type: 'success', message, duration: 'short' });
  return true;
}

/** Shows a failed save or submit: in a dialog, or through `onError`, as accessory forms show it in place. */
export type ActionErrorHandler = (error: unknown) => void;

export async function commonDocSync(
  doc: FrappeDoc,
  onError?: ActionErrorHandler
): Promise<boolean> {
  try {
    await doc.sync();
  } catch (error) {
    await reportActionError(error, doc, onError, true);
    return false;
  }

  showActionToast(doc, 'sync');
  return true;
}

export async function commonDocSubmit(
  doc: FrappeDoc,
  onError?: ActionErrorHandler
): Promise<boolean> {
  if (!(await confirmSubmitWarning(doc))) {
    return false;
  }

  const success = await showSubmitDialog(doc, onError);
  if (!success) {
    return false;
  }

  showSubmitToast(doc);
  return true;
}

/** A stale copy still asks to reload in a dialog. */
async function reportActionError(
  error: unknown,
  doc: FrappeDoc,
  onError: ActionErrorHandler | undefined,
  dontThrow: boolean
) {
  if (onError && !(error instanceof ConflictError)) {
    onError(error);
    return;
  }

  await handleErrorWithDialog(error, doc, dontThrow);
}

/** The model's warning before a submit; a Yes accepts it, a No stops the submit. */
async function confirmSubmitWarning(doc: FrappeDoc): Promise<boolean> {
  const warning = await doc.getSubmitWarning();
  if (!warning) {
    return true;
  }

  const accept = async () => {
    await warning.accept();
    return true;
  };
  return (await showDialog({
    title: warning.title,
    type: 'warning',
    detail: warning.detail,
    buttons: [
      { label: t`Yes`, action: accept, isPrimary: true },
      { label: t`No`, action: () => false, isEscape: true },
    ],
  })) as boolean;
}

async function showSubmitDialog(doc: FrappeDoc, onError?: ActionErrorHandler) {
  const title = t`Submit ${getDocReferenceLabel(doc)}?`;
  const detail = getDocSubmitMessage(doc);

  let actionError: unknown;
  const yesAction = async () => {
    try {
      await doc.submit();
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
    await reportActionError(actionError, doc, onError, true);
  }

  return success;
}

function getDocSubmitMessage(doc: FrappeDoc): string {
  const question = t`Mark ${doc.schema.label} as submitted?`;
  return [question, doc.submitNote].filter(Boolean).join(' ');
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
  ModelNameEnum.StockEntry,
  ModelNameEnum.DeliveryNote,
  ModelNameEnum.PurchaseReceipt,
];

function getSubmitSuccessToastAction(doc: FrappeDoc) {
  const isStockTransfer = stockSchemas.includes(doc.schemaName);

  if (isStockTransfer && canOpenLedger('StockLedger')) {
    return {
      async action() {
        const route = getLedgerLink(doc, 'StockLedger');
        await routeTo(route);
      },
      actionText: t`View stock entries`,
    };
  }

  if (doc.isTransactional && canOpenLedger('GeneralLedger')) {
    return {
      async action() {
        const route = getLedgerLink(doc, 'GeneralLedger');
        await routeTo(route);
      },
      actionText: t`View accounting entries`,
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

function getDocReferenceLabel(doc: FrappeDoc) {
  const label = doc.typeLabel;
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
