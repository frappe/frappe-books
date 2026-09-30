import type { ListViewColumn } from 'fyo/model/types';
import { Field, FieldTypeEnum } from 'schemas/types';

// These values have direct database mappings. Other read-only values may be derived.
// Books names, then the Frappe names Frappe-backed schemas keep.
const storedReadOnlyFields = new Set([
  'name',
  'netTotal',
  'grandTotal',
  'baseGrandTotal',
  'net_total',
  'grand_total',
  'base_grand_total',
]);
// Books names, then the Frappe names Frappe-backed schemas keep.
const auditFields = new Set([
  'created',
  'modified',
  'createdBy',
  'modifiedBy',
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

  const filteredFields = fields.filter((f) => {
    if (excludedFieldsTypes.includes(f.fieldtype)) {
      return false;
    }

    if (typeof f.filter === 'boolean') return f.filter;

    if (f.computed) return false;
    if (f.meta) return auditFields.has(f.fieldname);
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
