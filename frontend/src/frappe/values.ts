import type { Fyo } from 'fyo';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import { isPesa } from 'fyo/utils';
import { ValueError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';
import { FieldTypeEnum } from 'schemas/types';
import type { Field, RawValue, Schema } from 'schemas/types';
import { getIsNullOrUndef, safeParseFloat, safeParseInt } from 'utils';
import type { DocValues } from './api';

const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss.SSS';
// Frappe compares these to the stored values as text, down to microseconds.
const STAMPS = ['modified', 'creation'];

/**
 * The values a form edits, from a Frappe document or row. Datetimes, which
 * Frappe stores in the system time zone, become dates; `modified` and
 * `creation`, which Frappe compares as sent, stay as sent.
 */
export function toDocValues(
  schema: Schema,
  values: DocValues,
  fyo: Fyo,
  getSchema: (target: string) => Schema
): DocValueMap {
  const docValues: DocValueMap = {};
  for (const field of schema.fields) {
    const value = values[field.fieldname];
    if (value === undefined) {
      continue;
    }

    docValues[field.fieldname] = Array.isArray(value)
      ? value.map((row: DocValues) =>
          toDocValues(getTableSchema(field, getSchema), row, fyo, getSchema)
        )
      : toDocValue(value as RawValue, field, fyo);
  }

  return docValues;
}

/** A field's value as a form edits it, from text or a number as Frappe or a file holds it. */
export function toDocValue(value: RawValue, field: Field, fyo: Fyo): DocValue {
  if (STAMPS.includes(field.fieldname)) {
    return value as DocValue;
  }

  switch (field.fieldtype) {
    case FieldTypeEnum.Currency:
      return toDocCurrency(value, field, fyo);
    case FieldTypeEnum.Date:
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

/** A field's value as Frappe takes it; datetimes in the system time zone. */
export function toFrappeValue(
  value: DocValue,
  field: Field,
  fyo: Fyo
): RawValue {
  switch (field.fieldtype) {
    case FieldTypeEnum.Currency:
      return toRawCurrency(value, fyo, field);
    case FieldTypeEnum.Date:
      return toRawDate(value, field);
    case FieldTypeEnum.Datetime:
      return toRawDatetime(value, field);
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

/** A datetime as Frappe sends it, in ISO with the system time zone's offset. */
export function toIsoDatetime(value: unknown): string {
  const text = String(value);
  const datetime = DateTime.fromSQL(text, { zone: getSystemZone() });
  return `${text.replace(' ', 'T')}${datetime.toFormat('ZZ')}`;
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

/** Datetimes, unlike dates, are read in the system time zone, as Frappe writes them. */
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

  const zone =
    field.fieldtype === FieldTypeEnum.Datetime ? getSystemZone() : undefined;
  const sql = DateTime.fromSQL(value, { zone });
  const date = sql.isValid ? sql : DateTime.fromISO(value, { zone });
  if (!date.isValid) {
    throwError(value, field, 'doc');
  }

  return date.toJSDate();
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

  throwError(value, field, 'raw');
}

function toRawDatetime(value: DocValue, field: Field): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    const datetime = DateTime.fromJSDate(value).setZone(getSystemZone());
    return datetime.toFormat(DATETIME_FORMAT);
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

function getTableSchema(field: Field, getSchema: (target: string) => Schema) {
  return getSchema((field as { target: string }).target);
}

function getSystemZone(): string {
  const zone = window.frappe.boot?.time_zone?.system;
  if (!zone) {
    throw new Error('The boot has no system time zone');
  }

  return zone;
}
