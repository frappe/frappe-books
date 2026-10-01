import { DateTime } from 'luxon';
import { t } from 'fyo';
import type { Field } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import { DOCSTATUS_FLAGS, toDocStatusFilter } from './filterFields';

export const filterConditions = [
  { label: t`Is`, value: '=' },
  { label: t`Is Not`, value: '!=' },
  { label: t`Contains`, value: 'like' },
  { label: t`Does Not Contain`, value: 'not like' },
  { label: t`Greater Than`, value: '>' },
  { label: t`Less Than`, value: '<' },
  { label: t`Is Empty`, value: 'is null' },
  { label: t`Is Not Empty`, value: 'is not null' },
] as const;

export type FilterCondition = (typeof filterConditions)[number]['value'];
export type FilterValue = string | number | boolean | null | undefined;
export interface FilterRow {
  id: number;
  fieldname: string;
  condition: FilterCondition;
  value: FilterValue;
  implicit: boolean;
}

const numericTypes = new Set(['Int', 'Float', 'Currency']);
const dateTypes = new Set(['Date', 'Datetime']);

export class FilterSet {
  rows: FilterRow[] = [];
  private nextId = 0;

  add(
    fieldname: string,
    condition: FilterCondition,
    value: FilterValue = '',
    implicit = false
  ) {
    this.rows.push({
      id: this.nextId++,
      fieldname,
      condition,
      value,
      implicit,
    });
  }

  remove(id: number) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  clear() {
    this.rows = this.rows.filter((row) => row.implicit);
  }

  /** Frappe filters for the complete rows; throws on an invalid row. */
  toFilters(fields: Field[]): Filter[] {
    return this.rows.filter(isCompleteFilter).map((row) => {
      const field = fields.find((field) => field.fieldname === row.fieldname);
      if (!field) throw new Error(t`Unknown filter field: ${row.fieldname}`);
      if (
        !conditionsForField(field).some(
          (condition) => condition.value === row.condition
        )
      ) {
        throw new Error(t`Invalid condition for ${field.label}`);
      }
      return toFilter(row, parseFilterValue(field, row));
    });
  }

  normalize() {
    const lastRow = this.rows.at(-1);
    const seen = new Set<string>();
    this.rows = this.rows.filter((row) => {
      if (!isCompleteFilter(row)) return row === lastRow;
      const key = JSON.stringify([
        row.fieldname,
        row.condition,
        row.value,
        row.implicit,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export function isValuelessCondition(condition: string) {
  return condition === 'is null' || condition === 'is not null';
}

export function isCompleteFilter(row: FilterRow) {
  return (
    Boolean(row.fieldname && row.condition) &&
    (isValuelessCondition(row.condition) ||
      (row.value !== '' && row.value !== null && row.value !== undefined))
  );
}

export function conditionsForField(field?: Field) {
  return filterConditions.filter(({ value }) => {
    if (field?.fieldtype === 'Check') return value === '=' || value === '!=';
    if (
      numericTypes.has(field?.fieldtype ?? '') ||
      dateTypes.has(field?.fieldtype ?? '')
    ) {
      return value !== 'like' && value !== 'not like';
    }
    return true;
  });
}

export function defaultCondition(field?: Field): FilterCondition {
  return ['Data', 'Text', 'Color', 'AutoComplete'].includes(
    field?.fieldtype ?? 'Data'
  )
    ? 'like'
    : '=';
}

function toFilter(row: FilterRow, value: string | number | null): Filter {
  const { fieldname, condition } = row;
  if (isValuelessCondition(condition)) {
    return [fieldname, 'is', condition === 'is null' ? 'not set' : 'set'];
  }

  if (condition === 'like' || condition === 'not like') {
    return [fieldname, condition, `%${value}%`];
  }

  if (DOCSTATUS_FLAGS[fieldname]) {
    return toDocStatusFilter(fieldname, condition, value as number);
  }

  return [fieldname, condition, value];
}

function parseFilterValue(
  field: Field,
  row: FilterRow
): string | number | null {
  if (isValuelessCondition(row.condition)) return null;
  const value = row.value;
  if (field.fieldtype === 'Check') {
    if ([true, 1, '1'].includes(value as string)) return 1;
    if ([false, 0, '0'].includes(value as string)) return 0;
    throw new Error(t`Choose Yes or No for ${field.label}`);
  }
  if (numericTypes.has(field.fieldtype)) {
    const number =
      typeof value === 'boolean' || !String(value).trim() ? NaN : Number(value);
    if (
      !Number.isFinite(number) ||
      (field.fieldtype === 'Int' && !Number.isInteger(number))
    ) {
      throw new Error(t`Enter a valid number for ${field.label}`);
    }
    return number;
  }
  if (dateTypes.has(field.fieldtype)) {
    const text = String(value);
    const date = DateTime.fromISO(text.replace(' ', 'T'));
    const format =
      field.fieldtype === 'Date'
        ? /^\d{4}-\d{2}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
    if (!date.isValid || !format.test(text)) {
      throw new Error(
        field.fieldtype === 'Datetime'
          ? t`Enter a valid date and time for ${field.label}`
          : t`Enter a valid date for ${field.label}`
      );
    }
    return field.fieldtype === 'Date'
      ? text
      : date.toFormat('yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}
