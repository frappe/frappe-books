import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { getMoreDetailsFields } from 'src/frappe/extraFields';
import { Field, FieldTypeEnum } from 'schemas/types';
import { getAmountField } from './rowSummary';

export interface RowDetail {
  key: string;
  label: string;
  value: string;
  emphasis: boolean;
}

/** Every column of a row, including those its summary leaves out; of accessory mode's extra fields, those More details shows. */
export function getRowDetails(row: FrappeDoc): RowDetail[] {
  const extras = new Set(getMoreDetailsFields(row).map((f) => f.fieldname));
  const tableFields = (row.schema.tableFields ?? []).map(
    (fieldname) => row.fieldMap[fieldname]
  );
  const amountField = getAmountField(tableFields);

  return row.schema.fields
    .filter((field) => isShown(row, field))
    .filter((field) => !field.moreDetails || extras.has(field.fieldname))
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
    !row.getFieldState(field).hidden
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
