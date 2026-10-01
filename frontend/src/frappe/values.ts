import type { Fyo } from 'fyo';
import { Converter } from 'fyo/utils/converter';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import { DateTime } from 'luxon';
import type { Field, RawValue, Schema } from 'schemas/types';
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

export function toDocValue(value: RawValue, field: Field, fyo: Fyo): DocValue {
  if (STAMPS.includes(field.fieldname)) {
    return value as DocValue;
  }

  if (isZonedDatetime(field) && typeof value === 'string' && value) {
    return DateTime.fromSQL(value, { zone: getSystemZone() }).toJSDate();
  }

  return Converter.toDocValue(value, field, fyo);
}

export function toFrappeValue(
  value: DocValue,
  field: Field,
  fyo: Fyo
): unknown {
  if (isZonedDatetime(field) && value instanceof Date) {
    const datetime = DateTime.fromJSDate(value).setZone(getSystemZone());
    return datetime.toFormat(DATETIME_FORMAT);
  }

  return Converter.toRawValue(value, field, fyo);
}

/** A datetime as Frappe sends it, in ISO with the system time zone's offset. */
export function toIsoDatetime(value: unknown): string {
  const text = String(value);
  const datetime = DateTime.fromSQL(text, { zone: getSystemZone() });
  return `${text.replace(' ', 'T')}${datetime.toFormat('ZZ')}`;
}

function getTableSchema(field: Field, getSchema: (target: string) => Schema) {
  return getSchema((field as { target: string }).target);
}

function isZonedDatetime(field: Field): boolean {
  return field.fieldtype === 'Datetime' && !STAMPS.includes(field.fieldname);
}

function getSystemZone(): string {
  const zone = window.frappe.boot?.time_zone?.system;
  if (!zone) {
    throw new Error('The boot has no system time zone');
  }

  return zone;
}
