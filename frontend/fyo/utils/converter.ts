import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { isPesa } from 'fyo/utils';
import { ValueError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';
import { Field, FieldTypeEnum, RawValue } from 'schemas/types';
import { getIsNullOrUndef, safeParseFloat, safeParseInt } from 'utils';

/** Converts a field's raw value, as text or a number, to the value a form edits, and back. */
export class Converter {
  static toDocValue(value: RawValue, field: Field, fyo: Fyo): DocValue {
    if (field.fieldname === 'modified') {
      // Frappe compares the stored value, down to microseconds, to refuse stale saves.
      return toDocString(value, field);
    }

    switch (field.fieldtype) {
      case FieldTypeEnum.Currency:
        return toDocCurrency(value, field, fyo);
      case FieldTypeEnum.Date:
        return toDocDate(value, field);
      case FieldTypeEnum.Datetime:
        return toDocDate(value, field);
      case FieldTypeEnum.Int:
        return toDocInt(value, field);
      case FieldTypeEnum.Float:
        return toDocFloat(value, field);
      case FieldTypeEnum.Check:
        return toDocCheck(value, field);
      default:
        return toDocString(value, field);
    }
  }

  static toRawValue(value: DocValue, field: Field, fyo: Fyo): RawValue {
    switch (field.fieldtype) {
      case FieldTypeEnum.Currency:
        return toRawCurrency(value, fyo, field);
      case FieldTypeEnum.Date:
        return toRawDate(value, field);
      case FieldTypeEnum.Datetime:
        return toRawDateTime(value, field);
      case FieldTypeEnum.Int:
        return toRawInt(value, field);
      case FieldTypeEnum.Float:
        return toRawFloat(value, field);
      case FieldTypeEnum.Check:
        return toRawCheck(value, field);
      case FieldTypeEnum.Link:
        return toRawLink(value, field);
      case FieldTypeEnum.Button:
        return null;
      default:
        return toRawString(value, field);
    }
  }
}

function toDocString(value: RawValue, field: Field) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  throwError(value, field, 'doc');
}

function toDocDate(value: RawValue, field: Field) {
  if ((value as unknown) instanceof Date) {
    return value;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throwError(value, field, 'doc');
  }

  const date = DateTime.fromISO(value).toJSDate();
  if (date.toString() === 'Invalid Date') {
    throwError(value, field, 'doc');
  }

  return date;
}

function toDocCurrency(value: RawValue, field: Field, fyo: Fyo) {
  if (isPesa(value)) {
    return value;
  }

  if (value === '') {
    return fyo.pesa(0);
  }

  if (typeof value === 'string') {
    return fyo.pesa(value);
  }

  if (typeof value === 'number') {
    return fyo.pesa(value);
  }

  if (typeof value === 'boolean') {
    return fyo.pesa(Number(value));
  }

  if (value === null) {
    return fyo.pesa(0);
  }

  throwError(value, field, 'doc');
}

function toDocInt(value: RawValue, field: Field): number {
  if (value === '') {
    return 0;
  }

  if (typeof value === 'string') {
    value = safeParseInt(value);
  }

  return toDocFloat(value, field);
}

function toDocFloat(value: RawValue, field: Field): number {
  if (value === '') {
    return 0;
  }

  if (typeof value === 'boolean') {
    return Number(value);
  }

  if (typeof value === 'string') {
    value = safeParseFloat(value);
  }

  if (value === null) {
    value = 0;
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  throwError(value, field, 'doc');
}

function toDocCheck(value: RawValue, field: Field): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return !!safeParseFloat(value);
  }

  if (typeof value === 'number') {
    return Boolean(value);
  }

  throwError(value, field, 'doc');
}

function toRawCurrency(value: DocValue, fyo: Fyo, field: Field): string {
  if (isPesa(value)) {
    return value.store;
  }

  if (getIsNullOrUndef(value)) {
    return fyo.pesa(0).store;
  }

  if (typeof value === 'number') {
    return fyo.pesa(value).store;
  }

  if (typeof value === 'string') {
    return fyo.pesa(value).store;
  }

  throwError(value, field, 'raw');
}

function toRawInt(value: DocValue, field: Field): number {
  if (typeof value === 'string') {
    return safeParseInt(value);
  }

  if (getIsNullOrUndef(value)) {
    return 0;
  }

  if (typeof value === 'number') {
    return Math.floor(value);
  }

  throwError(value, field, 'raw');
}

function toRawFloat(value: DocValue, field: Field): number {
  if (typeof value === 'string') {
    return safeParseFloat(value);
  }

  if (getIsNullOrUndef(value)) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  throwError(value, field, 'raw');
}

function toRawDate(value: DocValue, field: Field): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    value = new Date(value);
  }

  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate();
  }

  if (value instanceof DateTime) {
    return value.toISODate();
  }

  throwError(value, field, 'raw');
}

function toRawDateTime(value: DocValue, field: Field): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof DateTime) {
    return value.toJSDate().toISOString();
  }

  throwError(value, field, 'raw');
}

function toRawCheck(value: DocValue, field: Field): number {
  if (typeof value === 'number') {
    value = Boolean(value);
  }

  if (typeof value === 'boolean') {
    return Number(value);
  }

  throwError(value, field, 'raw');
}

function toRawString(value: DocValue, field: Field): string | null {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  throwError(value, field, 'raw');
}

function toRawLink(value: DocValue, field: Field): string | null {
  if (value === null || !(value as string)?.length) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  throwError(value, field, 'raw');
}

function throwError<T>(value: T, field: Field, type: 'raw' | 'doc'): never {
  throw new ValueError(
    `invalid ${type} conversion '${String(
      value
    )}' of type ${typeof value} found, field: ${JSON.stringify(field)}`
  );
}
