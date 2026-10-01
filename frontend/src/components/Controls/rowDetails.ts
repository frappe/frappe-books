import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { Field, FieldTypeEnum } from 'schemas/types';
import { evaluateHidden } from 'src/utils/doc';
import { getAmountField } from './rowSummary';

export interface RowDetail {
  key: string;
  label: string;
  value: string;
  emphasis: boolean;
}

/** Every column of a row, including those its summary leaves out. */
export function getRowDetails(row: FrappeDoc): RowDetail[] {
  const tableFields = (row.schema.tableFields ?? []).map(
    (fieldname) => row.fieldMap[fieldname]
  );
  const amountField = getAmountField(tableFields);

  return row.schema.fields
    .filter((field) => isShown(row, field))
    .map((field) => ({
      key: field.fieldname,
      label: field.label ?? field.fieldname,
      value: formatValue(row, field),
      emphasis: field.fieldname === amountField?.fieldname,
    }));
}

function isShown(row: FrappeDoc, field: Field) {
  return (
    !field.meta &&
    field.fieldname !== 'name' &&
    field.fieldtype !== FieldTypeEnum.Table &&
    !evaluateHidden(field, row)
  );
}

function formatValue(row: FrappeDoc, field: Field): string {
  const value = row.get(field.fieldname);
  if (field.fieldtype === FieldTypeEnum.Check) {
    return value ? t`Yes` : t`No`;
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return row.fyo.format(value, field, row) || '—';
}
