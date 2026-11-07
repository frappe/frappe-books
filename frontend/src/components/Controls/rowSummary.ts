import type { FrappeDoc } from 'src/frappe/document';
import { Field, FieldTypeEnum } from 'schemas/types';
import { fyo } from 'src/initFyo';

export interface RowSummary {
  title: string;
  meta: string;
  amount: string;
  /** What the amount is, under it, e.g. a journal entry row's Credit. */
  amountLabel?: string;
}

const quantityFields = ['qty', 'quantity'];
// Invoice rows show their rate per transfer unit, as their Qty is.
const rateFields = ['rate', 'transfer_rate'];

/**
 * Phone summary of a table row: the first column, a closing amount, the rest.
 * Labelled fields show their labels, the amount's under it.
 */
export function getRowSummary(row: FrappeDoc, fields: Field[]): RowSummary {
  const [titleField, ...rest] = fields;
  const amountField = getAmountField(fields);
  const metaFields = rest.filter((field) => field !== amountField);
  const labelled = row.schema.mobileLabelledFields ?? [];

  return {
    title: titleField ? formatCell(row, titleField) : '',
    amount: amountField ? formatCell(row, amountField) : '',
    meta: getMeta(row, metaFields, labelled),
    amountLabel:
      amountField && labelled.includes(amountField.fieldname)
        ? amountField.label
        : undefined,
  };
}

/** The closing currency column, shown as the row's amount. */
export function getAmountField(fields: Field[]): Field | undefined {
  const last = fields.slice(1).at(-1);
  return last?.fieldtype === FieldTypeEnum.Currency ? last : undefined;
}

function getMeta(row: FrappeDoc, fields: Field[], labelled: string[]) {
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
      const value = formatCell(row, field);
      const isLabelled = value && labelled.includes(field.fieldname);
      parts.push(isLabelled ? `${field.label} ${value}` : value);
    }
  }

  return parts.filter(Boolean).join(' · ');
}

function formatCell(row: FrappeDoc, field: Field): string {
  const value = row.get(field.fieldname);
  const isEmpty = value === null || value === undefined || value === '';
  if (isEmpty || row.getFieldState(field).hidden) {
    return '';
  }

  const formatted = fyo.format(value, field, row);
  // Tax rates are stored as plain numbers.
  return field.fieldname === 'rate' && field.fieldtype === FieldTypeEnum.Float
    ? `${formatted}%`
    : formatted;
}
