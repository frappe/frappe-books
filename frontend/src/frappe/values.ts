import type { Fyo } from 'fyo';
import { Converter } from 'fyo/core/converter';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import { DateTime } from 'luxon';
import type { Field, RawValue, Schema } from 'schemas/types';
import type { DocValues } from './api';

const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss.SSS';

/**
 * The values a form edits, from a Frappe document or row. Datetimes, which
 * Frappe stores in the system time zone, become dates; `modified` and
 * `creation`, which Frappe compares with what it holds, stay as sent.
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
  if (field.fieldname === 'creation') {
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

function getTableSchema(field: Field, getSchema: (target: string) => Schema) {
  return getSchema((field as { target: string }).target);
}

function isZonedDatetime(field: Field): boolean {
  return field.fieldtype === 'Datetime' && field.fieldname !== 'modified';
}

function getSystemZone(): string {
  const zone = window.frappe.boot?.time_zone?.system;
  if (!zone) {
    throw new Error('The boot has no system time zone');
  }

  return zone;
}
