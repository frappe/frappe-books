import type { Field } from 'schemas/types';
import { isFieldShown } from 'src/utils/doc';
import { getIsNullOrUndef } from 'utils';
import { reactive, toRaw } from 'vue';
import { sortEndTabs } from './accessoryLayout';
import type { FrappeDoc } from './document';

/**
 * Accessory mode's ERPNext fields with no Books position: More details and
 * the end tabs. A mandatory field More details shows only while it is still
 * empty after the server fills defaults: noted when the form loads, it leaves
 * once a preview fills it and does not come back in that form.
 */
const shownMissing = new WeakMap<FrappeDoc, Set<string>>();
const noted = new WeakSet<FrappeDoc>();

/** Notes the mandatory fields with no Books position that are empty now, of the document and its rows. */
export function noteMissingExtras(doc: FrappeDoc) {
  for (const shown of [doc, ...getRows(doc)]) {
    noted.delete(toRaw(shown));
    noteRowMissingExtras(shown);
  }
}

/** Notes a document's or row's empty mandatory fields once, e.g. a row added after the form loaded. */
export function noteRowMissingExtras(doc: FrappeDoc) {
  if (noted.has(toRaw(doc))) {
    return;
  }

  noted.add(toRaw(doc));
  const shown = getShown(doc);
  shown.clear();
  for (const fieldname of getEmptyMandatory(doc)) {
    shown.add(fieldname);
  }
}

/** Shows mandatory fields a save found empty, wherever they had left. */
export function showMissingExtras(doc: FrappeDoc, fieldnames: string[]) {
  const shown = getShown(doc);
  for (const fieldname of fieldnames) {
    if (doc.fieldMap[fieldname]?.moreDetails === 'ifMissing') {
      shown.add(fieldname);
    }
  }
}

/** Drops the shown mandatory fields a preview just filled. */
export function forgetFilledExtras(doc: FrappeDoc, filled: Set<string>) {
  const shown = getShown(doc);
  for (const fieldname of shown) {
    if (filled.has(fieldname) && !isEmpty(doc.get(fieldname))) {
      shown.delete(fieldname);
    }
  }
}

/** The fields More details shows now, in ERPNext order. */
export function getMoreDetailsFields(doc: FrappeDoc): Field[] {
  const shown = getShown(doc);
  return getVisible(doc).filter(
    (field) =>
      field.moreDetails === 'picked' ||
      (field.moreDetails === 'ifMissing' && shown.has(field.fieldname))
  );
}

/** The fields of each end tab, in tab order; tabs without visible fields are left out. */
export function getEndTabs(doc: FrappeDoc): Map<string, Field[]> {
  const tabs = new Map<string, Field[]>();
  for (const field of getVisible(doc)) {
    if (field.appTab) {
      tabs.set(field.appTab, [...(tabs.get(field.appTab) ?? []), field]);
    }
  }

  return new Map(
    sortEndTabs([...tabs.keys()]).map((tab) => [tab, tabs.get(tab)!])
  );
}

/** Whether a field is empty and mandatory now, as a save would refuse it. */
export function isMissing(doc: FrappeDoc, field: Field): boolean {
  return doc.getFieldState(field).required && isEmpty(doc.get(field.fieldname));
}

function getEmptyMandatory(doc: FrappeDoc): string[] {
  return doc.schema.fields
    .filter((field) => field.moreDetails === 'ifMissing')
    .filter((field) => {
      const state = doc.getFieldState(field);
      return !state.hidden && !state.readOnly && isMissing(doc, field);
    })
    .map(({ fieldname }) => fieldname);
}

function getShown(doc: FrappeDoc): Set<string> {
  if (!shownMissing.has(toRaw(doc))) {
    shownMissing.set(toRaw(doc), reactive(new Set<string>()));
  }

  return shownMissing.get(toRaw(doc))!;
}

function getVisible(doc: FrappeDoc): Field[] {
  return doc.schema.fields.filter(
    (field) => !field.meta && isFieldShown(doc, field)
  );
}

function getRows(doc: FrappeDoc): FrappeDoc[] {
  return doc.tableFields.flatMap(
    ({ fieldname }) => (doc.get(fieldname) ?? []) as FrappeDoc[]
  );
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return getIsNullOrUndef(value) || value === '';
}
