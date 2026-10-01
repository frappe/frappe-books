import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { Money } from 'pesa';
import { Field, FieldType, OptionField, SelectOption } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';

export function unique<T>(list: T[], key = (it: T) => String(it)) {
  const seen: Record<string, boolean> = {};
  return list.filter((item) => {
    const k = key(item);
    return Object.hasOwn(seen, k) ? false : (seen[k] = true);
  });
}

export function isPesa(value: unknown): value is Money {
  return value instanceof Money;
}

export function isFalsy(value: unknown): boolean {
  if (!value) {
    return true;
  }

  if (isPesa(value) && value.isZero()) {
    return true;
  }

  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return true;
  }

  return false;
}

/** The actions of the doc's model; a doc's statics come from its own class. */
export function getActions(doc: FrappeDoc): Action[] {
  return (doc.constructor as typeof FrappeDoc).getActions(doc.fyo);
}

export function getOptionList(
  field: Field,
  doc: FrappeDoc | undefined | null
): SelectOption[] {
  const list = getRawOptionList(field, doc);
  return list.map((option) => {
    if (typeof option === 'string') {
      return {
        label: option,
        value: option,
      };
    }

    return option;
  });
}

function getRawOptionList(field: Field, doc: FrappeDoc | undefined | null) {
  const options = (field as OptionField).options;
  if (options && options.length > 0) {
    return (field as OptionField).options;
  }

  if (getIsNullOrUndef(doc)) {
    return [];
  }

  const getList = (doc.constructor as typeof FrappeDoc).lists[field.fieldname];
  if (getList === undefined) {
    return [];
  }

  return getList(doc);
}

export function getEmptyValuesByFieldTypes(
  fieldtype: FieldType,
  fyo: Fyo
): DocValue {
  switch (fieldtype) {
    case 'Date':
    case 'Datetime':
      return new Date();
    case 'Float':
    case 'Int':
      return 0;
    case 'Currency':
      return fyo.pesa(0);
    case 'Check':
      return false;
    case 'DynamicLink':
    case 'Link':
    case 'Select':
    case 'AutoComplete':
    case 'Text':
    case 'Data':
    case 'Color':
      return null;
    case 'Table':
    case 'Attachment':
    case 'AttachImage':
    default:
      return null;
  }
}
