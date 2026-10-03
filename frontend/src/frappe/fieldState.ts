import type { Field } from 'schemas/types';
import { getIsNullOrUndef, getMapFromList } from 'utils';
import { computed, reactive, toRaw, type ComputedRef } from 'vue';
import { evaluateCondition, type EvalDoc } from './dependsOn';
import { getDocType } from './doctypes';
import type { FrappeDoc } from './document';
import type { DocField, DocTypeMeta } from './meta';

/** Whether a field is hidden, read only or required on a document now. */
export interface FieldState {
  hidden: boolean;
  readOnly: boolean;
  required: boolean;
}

type FieldRule = keyof FieldState;

const ruleConditions: Record<
  FieldRule,
  (field: DocField) => string | undefined
> = {
  hidden: (field) => field.depends_on,
  readOnly: (field) => field.read_only_depends_on,
  required: (field) => field.mandatory_depends_on,
};

const docFieldMaps = new WeakMap<DocTypeMeta, Record<string, DocField>>();
const evalDocs = new WeakMap<FrappeDoc, ComputedRef<EvalDoc>>();

/**
 * A field's state on `doc`, decided in this order:
 * 1. Read only, before all else: a set-once field of a saved document, a
 *    name the server gives or that is saved, a submitted or cancelled
 *    document, or no right to write it.
 * 2. The field's own property, when set: true from the DocType or the
 *    permission levels, false from the model's presentation.
 * 3. The DocField's depends_on, read_only_depends_on or mandatory_depends_on.
 * 4. The model's `hidden`, `readOnly` or `required` map.
 *
 * `field` may be a copy of the document's field with its own properties,
 * such as a relabelled field.
 */
export function getFieldState(doc: FrappeDoc, field: Field): FieldState {
  return {
    hidden: isRuleOn(doc, field, 'hidden'),
    readOnly: isLocked(doc, field) || isRuleOn(doc, field, 'readOnly'),
    required: isRuleOn(doc, field, 'required'),
  };
}

/**
 * The required fields of `doc` that are empty. Hidden fields count, as
 * Frappe's form checks them on save.
 */
export function getMissingFields(doc: FrappeDoc): Field[] {
  return doc.schema.fields.filter(
    (field) =>
      isRuleOn(doc, field, 'required') && isEmpty(doc.get(field.fieldname))
  );
}

/** The labels of the missing fields; a row's come after its table and row number. */
export function getMissingMessage(doc: FrappeDoc): string {
  const message = getMissingFields(doc)
    .map((field) => field.label ?? field.fieldname)
    .join(', ');
  const { parentdoc, parentFieldname } = doc;
  if (!message || !parentdoc || !parentFieldname) {
    return message;
  }

  const table = parentdoc.fieldMap[parentFieldname];
  return `${table.label} Row ${(doc.idx ?? 0) + 1}: ${message}`;
}

/** Edits may not change the field, whatever its own rules say. */
function isLocked(doc: FrappeDoc, field: Field): boolean {
  if (doc.inserted && field.setOnlyOnce) {
    return true;
  }

  const isNamed = doc.inserted || doc.schema.naming !== 'manual';
  if (field.fieldname === 'name' && isNamed) {
    return true;
  }

  // `submitted` holds for a cancelled document too; a row follows its document.
  return doc.submitted || !!doc.parentdoc?.submitted || !doc.canWrite;
}

/** Steps 2 to 4 of `getFieldState` for one of its three answers. */
function isRuleOn(doc: FrappeDoc, field: Field, rule: FieldRule): boolean {
  const value = field[rule];
  if (value !== undefined) {
    return value;
  }

  return (
    isConditionOn(doc, field.fieldname, rule) ||
    !!doc[rule][field.fieldname]?.()
  );
}

/** Whether depends_on hides the field, or its read only or mandatory condition holds. */
function isConditionOn(
  doc: FrappeDoc,
  fieldname: string,
  rule: FieldRule
): boolean {
  const docfield = getDocFields(doc)[fieldname];
  const condition = docfield && ruleConditions[rule](docfield);
  if (!condition) {
    return false;
  }

  let evalDoc = getEvalDoc(doc);
  if (rule === 'readOnly') {
    // A field locks on its saved value, so an unsaved edit never locks it.
    evalDoc = { ...evalDoc, [fieldname]: doc._getSavedFrappeValue(fieldname) };
  }

  const parent = doc.parentdoc && getEvalDoc(doc.parentdoc);
  const isMet = evaluateCondition(condition, evalDoc, parent);
  return rule === 'hidden' ? !isMet : isMet;
}

/** The DocFields of the document's DocType by fieldname, mapped once per meta. */
function getDocFields(doc: FrappeDoc): Record<string, DocField> {
  const { meta } = getDocType(doc.schemaName);
  let docFields = docFieldMaps.get(meta);
  if (!docFields) {
    docFields = getMapFromList(meta.fields, 'fieldname');
    docFieldMaps.set(meta, docFields);
  }

  return docFields;
}

/**
 * `doc.getEvalDoc()`, worked out again only after a value of the document
 * or its rows changes, however it changed: Vue tracks what it read.
 */
function getEvalDoc(doc: FrappeDoc): EvalDoc {
  const raw = toRaw(doc);
  let evalDoc = evalDocs.get(raw);
  if (!evalDoc) {
    const reactiveDoc = reactive(raw) as FrappeDoc;
    evalDoc = computed(() => reactiveDoc.getEvalDoc());
    evalDocs.set(raw, evalDoc);
  }

  return evalDoc.value;
}

/** No value, an empty text or a table without rows. */
function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return getIsNullOrUndef(value) || value === '';
}
