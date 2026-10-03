import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { isPesa } from 'fyo/utils';
import { isEqual } from 'lodash';
import { Field, FieldType, FieldTypeEnum } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import type { FrappeDoc } from './document';

/** Whether two values of a field are equal: amounts by value, dates by time. */
export function areDocValuesEqual(
  dvOne: DocValue | FrappeDoc[],
  dvTwo: DocValue | FrappeDoc[]
): boolean {
  if (dvOne instanceof Date) {
    return dvTwo instanceof Date && dvOne.getTime() === dvTwo.getTime();
  }

  if (['string', 'number'].includes(typeof dvOne)) {
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

/** The value a field of the type starts with when it has no default. */
export function getPreDefaultValues(
  fieldtype: FieldType,
  fyo: Fyo
): DocValue | FrappeDoc[] {
  switch (fieldtype) {
    case FieldTypeEnum.Table:
      return [] as FrappeDoc[];
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

/** Whether a value is set: a nonzero amount, a table with rows. */
export function isDocValueTruthy(docValue: DocValue | FrappeDoc[]) {
  if (isPesa(docValue)) {
    return !docValue.isZero();
  }

  if (Array.isArray(docValue)) {
    return docValue.length > 0;
  }

  return !!docValue;
}

/** Numbers the rows by their place in the table. */
export function setChildDocIdx(childDocs: FrappeDoc[]) {
  childDocs.forEach((cd, idx) => {
    cd.idx = idx;
  });
}
