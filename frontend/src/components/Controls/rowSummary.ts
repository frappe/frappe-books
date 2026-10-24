import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { Field, FieldTypeEnum } from 'schemas/types';
import { getCalculatedState } from 'src/frappe/calculated';
import { isHiddenByCondition } from 'src/frappe/fieldState';
import { fyo } from 'src/initFyo';

export interface RowSummary {
  title: string;
  meta: string;
  amount: string;
  /** A labelled value under the amount, e.g. a tax row's running total. */
  detail?: string;
  /** The last preview failed on this row, so its amounts are unknown. */
  failed?: boolean;
}

const quantityFields = ['qty', 'quantity'];
// Invoice rows show their rate before discount, stock rows their rate.
const rateFields = ['rate', 'price_list_rate'];
// Tax summary rows and tax template rows.
const taxRateFields = ['rate', 'tax_rate'];

/**
 * Phone summary of a table row: the first column, a closing amount, the
 * rest, and the detail field under the amount. Fields the row's depends_on
 * hides are left out; amounts being calculated say so.
 */
export function getRowSummary(
  row: FrappeDoc,
  fields: Field[],
  detailField?: Field
): RowSummary {
  const [titleField, ...rest] = fields;
  const amountField = getAmountField(fields);
  const metaFields = rest.filter(
    (field) => field !== amountField && !isHiddenByCondition(row, field)
  );
  const state = amountField && getCalculatedState(row, amountField.fieldname);
  const detail =
    detailField && !state && hasValue(row, detailField)
      ? `${detailField.label} ${formatCell(row, detailField)}`
      : undefined;

  return {
    title: titleField ? formatCell(row, titleField) : '',
    amount: amountField ? formatAmount(row, amountField, state) : '',
    meta: getMeta(row, metaFields),
    detail,
    failed: state === 'failed',
  };
}

function formatAmount(row: FrappeDoc, field: Field, state?: string): string {
  if (state === 'calculating') {
    return t`Calculating…`;
  }

  return state === 'failed' ? '—' : formatCell(row, field);
}

function hasValue(row: FrappeDoc, field: Field): boolean {
  const value = row.get(field.fieldname);
  return value !== null && value !== undefined && value !== '';
}

/** The closing currency column, shown as the row's amount. */
export function getAmountField(fields: Field[]): Field | undefined {
  const last = fields.slice(1).at(-1);
  return last?.fieldtype === FieldTypeEnum.Currency ? last : undefined;
}

function getMeta(row: FrappeDoc, fields: Field[]) {
  const quantity = fields.find((f) => quantityFields.includes(f.fieldname));
  const rate = fields.find(
    (f) =>
      rateFields.includes(f.fieldname) && f.fieldtype === FieldTypeEnum.Currency
  );
  const pairQuantity = Boolean(quantity && rate);
  const parts = pairQuantity
    ? [`${formatCell(row, quantity!)} × ${formatCell(row, rate!)}`]
    : [];

  for (const field of fields) {
    if (!pairQuantity || (field !== quantity && field !== rate)) {
      parts.push(formatCell(row, field));
    }
  }

  return parts.filter(Boolean).join(' · ');
}

function formatCell(row: FrappeDoc, field: Field): string {
  const value = row.get(field.fieldname);
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const formatted = fyo.format(value, field, row);
  // Tax rates are stored as plain numbers.
  return taxRateFields.includes(field.fieldname) &&
    field.fieldtype === FieldTypeEnum.Float
    ? `${formatted}%`
    : formatted;
}
