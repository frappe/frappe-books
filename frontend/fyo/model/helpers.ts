import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { isPesa } from 'fyo/utils';
import { isEqual } from 'lodash';
import { Field, FieldType, FieldTypeEnum } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { Doc } from './doc';

export function areDocValuesEqual(
  dvOne: DocValue | Doc[],
  dvTwo: DocValue | Doc[]
): boolean {
  if (['string', 'number'].includes(typeof dvOne) || dvOne instanceof Date) {
    return dvOne === dvTwo;
  }

  if (isPesa(dvOne)) {
    return !getIsNullOrUndef(dvTwo) && dvOne.eq(dvTwo as string | number);
  }

  return isEqual(dvOne, dvTwo);
}

/** A field's default, with Frappe's "Now" and "Today" taken when the document is made. */
export function getFieldDefault(field: Field): DocValue | undefined {
  const dateTypes: FieldType[] = [FieldTypeEnum.Date, FieldTypeEnum.Datetime];
  const isDate = dateTypes.includes(field.fieldtype);
  if (isDate && (field.default === 'Now' || field.default === 'Today')) {
    return new Date();
  }

  return field.default as DocValue | undefined;
}

export function getPreDefaultValues(
  fieldtype: FieldType,
  fyo: Fyo
): DocValue | Doc[] {
  switch (fieldtype) {
    case FieldTypeEnum.Table:
      return [] as Doc[];
    case FieldTypeEnum.Currency:
      return fyo.pesa(0.0);
    case FieldTypeEnum.Int:
    case FieldTypeEnum.Float:
      return 0;
    // A check box is never empty; a custom one has no schema default.
    case FieldTypeEnum.Check:
      return false;
    default:
      return null;
  }
}

export function getMissingMandatoryFields(doc: Doc): Field[] {
  return getMandatory(doc).filter((f) => {
    const value = doc.get(f.fieldname);
    const isNullOrUndef = getIsNullOrUndef(value);

    if (f.fieldtype === FieldTypeEnum.Table) {
      return isNullOrUndef || (value as Doc[])?.length === 0;
    }

    return isNullOrUndef || value === '';
  });
}

export function getMissingMandatoryMessage(doc: Doc) {
  const message = getMissingMandatoryFields(doc)
    .map((f) => f.label ?? f.fieldname)
    .join(', ');

  if (message && doc.schema.isChild && doc.parentdoc && doc.parentFieldname) {
    const parentfield = doc.parentdoc.fieldMap[doc.parentFieldname];
    return `${parentfield.label} Row ${(doc.idx ?? 0) + 1}: ${message}`;
  }

  return message;
}

function getMandatory(doc: Doc): Field[] {
  const mandatoryFields: Field[] = [];
  for (const field of doc.schema.fields) {
    if (field.required) {
      mandatoryFields.push(field);
    }

    const requiredFunction = doc.required[field.fieldname];
    if (requiredFunction?.() || doc.hasFieldRule(field.fieldname, 'required')) {
      mandatoryFields.push(field);
    }
  }

  return mandatoryFields;
}

export function isDocValueTruthy(docValue: DocValue | Doc[]) {
  if (isPesa(docValue)) {
    return !docValue.isZero();
  }

  if (Array.isArray(docValue)) {
    return docValue.length > 0;
  }

  return !!docValue;
}

export function setChildDocIdx(childDocs: Doc[]) {
  childDocs.forEach((cd, idx) => {
    cd.idx = idx;
  });
}
