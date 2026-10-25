import { t } from 'fyo';
import { getDocType, isFrappeBacked } from 'src/frappe/doctypes';
import type { FrappeDocType } from 'src/frappe/doctypes';
import {
  getKeptPicks,
  getSavedPicks,
  type PickKey,
} from 'src/frappe/fieldPicks';
import { fetchDocType, reloadFieldPicks } from 'src/frappe/registry';
import { serverHtmlToText } from 'src/utils/serverHtml';
import { call, getServerMessages } from 'src/web/api';
import { markRaw, reactive } from 'vue';

const SAVE_METHOD =
  'frappe_books.frappe_books.doctype.books_field_pick.books_field_pick.save_field_picks';

/** The forms whose ERPNext fields can be picked, by schema name, grouped as the picker lists them. */
const PICKER_GROUPS = [
  {
    label: t`Sales`,
    schemaNames: ['Quotation', 'SalesInvoice', 'DeliveryNote', 'Customer'],
  },
  {
    label: t`Purchases`,
    schemaNames: ['PurchaseInvoice', 'PurchaseReceipt', 'Supplier'],
  },
  { label: t`Accounting`, schemaNames: ['PaymentEntry', 'JournalEntry'] },
  { label: t`Items`, schemaNames: ['Item'] },
];

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; docType: FrappeDocType; saved: Set<PickKey> };

/** Each form's ERPNext fields as last loaded, and the picks not saved yet. Kept until Save. */
const state = reactive({
  loaded: new Map<string, Loaded>(),
  drafts: new Map<string, Set<PickKey>>(),
});

export function getPickerGroups() {
  return PICKER_GROUPS.map(({ label, schemaNames }) => ({
    label,
    schemaNames: schemaNames.filter(isFrappeBacked),
  })).filter(({ schemaNames }) => schemaNames.length);
}

/** The ERPNext doctype a form shows, which names it in the picker. */
export function getPickerLabel(schemaName: string): string {
  return getDocType(schemaName).doctype;
}

export function getLoaded(schemaName: string): Loaded | undefined {
  return state.loaded.get(schemaName);
}

/** Loads a form's fields from ERPNext once; `reload` again, e.g. after an error. */
export async function loadFields(schemaName: string, reload = false) {
  const loaded = state.loaded.get(schemaName);
  if (loaded && !reload && loaded.status !== 'error') {
    return;
  }

  state.loaded.set(schemaName, { status: 'loading' });
  try {
    const docType = markRaw(await fetchDocType(schemaName));
    const saved = getSavedPicks(docType);
    state.loaded.set(schemaName, { status: 'ready', docType, saved });
  } catch (error) {
    state.loaded.set(schemaName, { status: 'error', error });
  }
}

/** The picks a form has in the picker: unsaved ones, else saved ones. */
export function getPicks(schemaName: string): Set<PickKey> {
  const draft = state.drafts.get(schemaName);
  if (draft) {
    return draft;
  }

  const loaded = state.loaded.get(schemaName);
  return loaded?.status === 'ready' ? loaded.saved : new Set();
}

export function togglePick(schemaName: string, key: PickKey) {
  const picks = new Set(getPicks(schemaName));
  if (!picks.delete(key)) {
    picks.add(key);
  }

  state.drafts.set(schemaName, picks);
}

/** Whether a form's picks differ from its saved ones. */
export function isChanged(schemaName: string): boolean {
  const loaded = state.loaded.get(schemaName);
  const draft = state.drafts.get(schemaName);
  if (loaded?.status !== 'ready' || !draft) {
    return false;
  }

  const kept = getKeptKeys(loaded.docType, draft);
  const saved = new Set(getKeptKeys(loaded.docType, loaded.saved));
  return kept.length !== saved.size || kept.some((key) => !saved.has(key));
}

/** The extra fields a form shows: its picks, unsaved ones included; before loading, as the form has them. */
export function getPickCount(schemaName: string): number {
  const loaded = state.loaded.get(schemaName);
  if (loaded?.status === 'ready') {
    return getKeptKeys(loaded.docType, getPicks(schemaName)).length;
  }

  return getSavedPicks(getDocType(schemaName)).size;
}

/** Saves a form's picks, and shows them on its open and new forms. */
export async function savePicks(schemaName: string) {
  const loaded = state.loaded.get(schemaName);
  if (loaded?.status !== 'ready') {
    return;
  }

  const { docType } = loaded;
  const kept = getKeptPicks(docType, getPicks(schemaName));
  await call(SAVE_METHOD, {
    document_type: docType.doctype,
    fields: kept.map(({ table, fieldname }) => ({
      table_fieldname: table,
      fieldname,
    })),
  });

  const saved = new Set(kept.map(({ key }) => key));
  state.loaded.set(schemaName, { status: 'ready', docType, saved });
  state.drafts.delete(schemaName);
  await reloadFieldPicks(docType.doctype);
}

function getKeptKeys(docType: FrappeDocType, picks: Set<PickKey>): PickKey[] {
  return getKeptPicks(docType, picks).map(({ key }) => key);
}

/** A failed request's message as text: the server's, else that the server could not be reached. */
export function getFailureText(error: unknown): string {
  if (!(error as { serverMessages?: unknown }).serverMessages) {
    return t`Couldn't reach the server. Check your connection and try again.`;
  }

  return getServerMessages(error)
    .map(({ message }) => serverHtmlToText(message))
    .join(' ');
}
