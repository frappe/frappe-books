import type { ColumnConfig, RenderData } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import type { Field } from 'schemas/types';
import { getFields } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { formatColumnValue, type ListColumn } from './listColumns';

/** Which list columns fill each part of a two-line phone row. */
export interface MobileRowLayout {
  title: ListColumn;
  amount?: ListColumn;
  badge?: ColumnConfig;
  meta: ListColumn[];
  avatar?: 'circle' | 'square';
}

/** Line 2 fields where the phone design differs from the list columns. */
const metaFieldnames: Record<string, string[]> = {
  [ModelNameEnum.Party]: ['role', 'phone'],
  [ModelNameEnum.Item]: ['item_type', 'tax'],
  [ModelNameEnum.Payment]: ['name', 'date', 'payment_type'],
};

/** Schemas whose rows start with an initials avatar. */
const avatarShapes: Record<string, MobileRowLayout['avatar']> = {
  [ModelNameEnum.Party]: 'circle',
  [ModelNameEnum.Item]: 'square',
};

/**
 * Line 1 is the party (or the first text column) and the first currency
 * column. Line 2 is the other text columns, dates last, and the badge.
 */
export function getMobileRowLayout(
  schemaName: string,
  columns: ListColumn[]
): MobileRowLayout {
  const badge = columns.find((column) => (column as ColumnConfig).badge);
  const text = columns.filter(
    (column) => column !== badge && !isNumeric(column.fieldtype)
  );
  const title =
    text.find((column) => column.fieldname === 'party') ??
    text[0] ??
    columns[0];

  return {
    title,
    amount: columns.find((column) => column.fieldtype === 'Currency'),
    badge: badge as ColumnConfig | undefined,
    meta: getMetaColumns(
      schemaName,
      text.filter((column) => column !== title)
    ),
    avatar: avatarShapes[schemaName],
  };
}

function getMetaColumns(schemaName: string, columns: ListColumn[]) {
  const fieldnames = metaFieldnames[schemaName];
  if (fieldnames) {
    return getFields(schemaName, fieldnames);
  }

  const isDate = (column: ListColumn) =>
    column.fieldtype === 'Date' || column.fieldtype === 'Datetime';
  return [
    ...columns.filter((column) => !isDate(column)),
    ...columns.filter(isDate),
  ];
}

/** Pay entries read as money going out; zero outstanding is left blank. */
export function getRowAmount(row: RenderData, column?: ListColumn): string {
  const amount = column ? row[column.fieldname] : undefined;
  if (!column || !(amount instanceof Money)) {
    return '';
  }

  if (column.fieldname === 'outstanding_amount' && amount.isZero()) {
    return '';
  }

  const signed = row.payment_type === 'Pay' ? amount.neg() : amount;
  return fyo.format(signed, column as Field);
}

export function getRowMeta(row: RenderData, columns: ListColumn[]): string {
  return columns
    .map((column) =>
      column.fieldtype === 'Datetime'
        ? fyo.format(row[column.fieldname], 'Date')
        : formatColumnValue(row, column)
    )
    .filter(Boolean)
    .join(' · ');
}
