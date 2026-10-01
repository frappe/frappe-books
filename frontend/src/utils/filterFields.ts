import type { ListViewColumn } from 'fyo/model/types';
import { t } from 'fyo/utils/translation';
import { Field, FieldTypeEnum } from 'schemas/types';
import type { Filter } from 'src/frappe/api';

// These values have direct database mappings. Other read-only values may be derived.
const storedReadOnlyFields = new Set([
  'name',
  'net_total',
  'grand_total',
  'base_grand_total',
]);
const auditFields = new Set([
  'modified',
  'submitted',
  'cancelled',
  'creation',
  'owner',
  'modified_by',
]);

export function getFilterFields(
  fields: Field[],
  columns: ListViewColumn[] = []
): Field[] {
  const excludedFieldsTypes: string[] = [
    FieldTypeEnum.Table,
    FieldTypeEnum.Attachment,
    FieldTypeEnum.AttachImage,
    FieldTypeEnum.Button,
    'Secret',
  ];

  const statusField = columns?.find(
    (column) => typeof column === 'object' && column.fieldname === 'status'
  ) as Field | undefined;

  const filteredFields = fields.flatMap(expandDocStatus).filter((f) => {
    if (excludedFieldsTypes.includes(f.fieldtype)) {
      return false;
    }

    if (typeof f.filter === 'boolean') return f.filter;

    if (f.computed) return false;
    // A Frappe-backed schema's name is a meta field, as it is not entered.
    if (f.meta) return auditFields.has(f.fieldname) || f.fieldname === 'name';
    if (f.readOnly) return storedReadOnlyFields.has(f.fieldname);

    return true;
  });

  // A status column can filter the list only when the server stores it.
  const storedStatusField = fields.find(
    (field) => field.fieldname === statusField?.fieldname
  );
  if (storedStatusField && !filteredFields.includes(storedStatusField)) {
    filteredFields.unshift(storedStatusField);
  }

  return filteredFields;
}

/** Books' Submitted and Cancelled, by the docstatus values that set them. */
export const DOCSTATUS_FLAGS: Record<string, number[] | undefined> = {
  submitted: [1, 2],
  cancelled: [2],
};

/** A Submitted or Cancelled filter as the docstatus filter it means. */
export function toDocStatusFilter(
  flag: string,
  operator: string,
  value: number
): Filter {
  const isSet = (operator === '=') === Boolean(value);
  return ['docstatus', isSet ? 'in' : 'not in', DOCSTATUS_FLAGS[flag]];
}

/** A Frappe-backed schema keeps docstatus, which Books lists and files show as Submitted and Cancelled. */
export function expandDocStatus(field: Field): Field[] {
  if (!field.meta || field.fieldname !== 'docstatus') {
    return [field];
  }

  return [
    { fieldname: 'submitted', label: t`Submitted`, fieldtype: 'Check' },
    { fieldname: 'cancelled', label: t`Cancelled`, fieldtype: 'Check' },
  ].map((flag) => ({ ...flag, meta: true }) as Field);
}

const fieldLabelAcronyms = new Set([
  'ERP',
  'GST',
  'GSTIN',
  'HSN',
  'ID',
  'POS',
  'SAC',
  'UOM',
]);

export function getFieldLabel(field: Field): string {
  const label = field.label?.trim();
  if (label && label !== field.fieldname) {
    return label;
  }

  return field.fieldname
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      const upperWord = word.toUpperCase();
      if (fieldLabelAcronyms.has(upperWord)) {
        return upperWord;
      }

      const lowerWord = word.toLowerCase();
      if (
        index > 0 &&
        ['and', 'an', 'a', 'from', 'by', 'on'].includes(lowerWord)
      ) {
        return lowerWord;
      }

      return lowerWord[0].toUpperCase() + lowerWord.slice(1);
    })
    .join(' ');
}
