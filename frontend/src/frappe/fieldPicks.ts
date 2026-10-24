import { t } from 'fyo';
import { hasDocTypePermission } from 'fyo/utils/permissions';
import type { Schema } from 'schemas/types';
import { getRowEditFieldnames } from 'src/utils/sheetFields';
import { DEFAULT_SECTION, getPositionedFields } from './accessoryLayout';
import type { FrappeDocType } from './doctypes';
import { isAccessoryMode } from './mode';

/** A pick's key: the table fieldname ('' for the document's own field) and the fieldname. */
export type PickKey = `${string}:${string}`;

/** Why a field is always on: mandatory in ERPNext, or already on the Books form. */
export type PickLock = 'mandatory' | 'onForm';

/** A field the field picker lists, as ERPNext names and places it. */
export interface PickerField {
  key: PickKey;
  /** The table fieldname of a row field; '' for the document's own. */
  table: string;
  fieldname: string;
  label: string;
  /** The ERPNext section's label, else its tab's. */
  section: string;
  fieldtype: string;
  lock?: PickLock;
}

/** A table whose row fields the picker lists. */
export interface PickerTable {
  fieldname: string;
  label: string;
  doctype: string;
}

/**
 * Field picks are accessory mode's form customization; only who can write
 * them (System Managers) picks. Read from the boot: a cold load's first route
 * guard runs before Books loads the user's permissions.
 */
export function canPickFields(): boolean {
  const user = globalThis.window?.frappe?.boot?.user;
  const permissions = user ? { doctypes: {}, user } : null;
  return (
    isAccessoryMode() &&
    hasDocTypePermission(permissions, 'Books Field Pick', 'write')
  );
}

export function toPickKey(table: string, fieldname: string): PickKey {
  return `${table}:${fieldname}`;
}

/**
 * The fields of a form, or of a table's rows, that the picker lists, in
 * ERPNext order: those the form can show. A field the form shows by Books'
 * layout is on it already; the rest go in More details when picked.
 */
export function getPickerFields(
  docType: FrappeDocType,
  table = ''
): PickerField[] {
  const shown = table ? docType.tables[table] : docType;
  if (!shown) {
    return [];
  }

  const fields = new Map(shown.schema.fields.map((f) => [f.fieldname, f]));
  const onForm = getOnFormFieldnames(shown.schema, !!table);
  return getPositionedFields(shown.meta).flatMap(
    ({ docfield, section, tab }) => {
      const field = fields.get(docfield.fieldname);
      const isOnForm = onForm.has(docfield.fieldname);
      if (!field || field.hidden || (!field.moreDetails && !isOnForm)) {
        return [];
      }

      const picked: PickerField = {
        key: toPickKey(table, docfield.fieldname),
        table,
        fieldname: docfield.fieldname,
        label: docfield.label || docfield.fieldname,
        section: section === DEFAULT_SECTION ? (tab ?? t`Details`) : section,
        fieldtype: docfield.fieldtype,
        lock: docfield.reqd ? 'mandatory' : isOnForm ? 'onForm' : undefined,
      };
      return [picked];
    }
  );
}

/**
 * The fields Books' layout shows: a form's positioned and end tab fields; a
 * row editor's Books fields and end tab fields. Positioned row fields the row
 * editor leaves out show nowhere, and picks do not move them.
 */
function getOnFormFieldnames(schema: Schema, isRow: boolean): Set<string> {
  const editorFields = new Set(getRowEditFieldnames(schema));
  const laidOut = schema.fields.filter(
    (field) =>
      !field.moreDetails &&
      (!isRow || !!field.appTab || editorFields.has(field.fieldname))
  );
  return new Set(laidOut.map(({ fieldname }) => fieldname));
}

/** The tables whose rows can be picked: those the form shows, Books' own and picked ones. */
export function getPickerTables(
  docType: FrappeDocType,
  picks: Set<PickKey>
): PickerTable[] {
  return getPickerFields(docType)
    .filter((field) => field.fieldtype === 'Table')
    .filter((field) => field.lock || picks.has(field.key))
    .map(({ fieldname, label }) => ({
      fieldname,
      label,
      doctype: docType.tables[fieldname]?.doctype ?? '',
    }))
    .filter(({ doctype }) => !!doctype);
}

/** The picks the form shows now: the picked fields of the document and of its pickable tables. */
export function getSavedPicks(docType: FrappeDocType): Set<PickKey> {
  const tables = ['', ...Object.keys(docType.tables)];
  const picked = tables.flatMap((table) =>
    (table ? docType.tables[table]! : docType).schema.fields
      .filter((field) => field.moreDetails === 'picked')
      .map((field) => toPickKey(table, field.fieldname))
  );
  const kept = getKeptPicks(docType, new Set(picked));
  return new Set(kept.map(({ key }) => key));
}

/** The picks a save keeps, in ERPNext order: free fields of the document and of the tables it offers. */
export function getKeptPicks(
  docType: FrappeDocType,
  picks: Set<PickKey>
): PickerField[] {
  const tables = [
    '',
    ...getPickerTables(docType, picks).map(({ fieldname }) => fieldname),
  ];
  return tables.flatMap((table) =>
    getPickerFields(docType, table).filter(
      (field) => !field.lock && picks.has(field.key)
    )
  );
}
