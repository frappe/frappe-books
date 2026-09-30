import type { Field, Schema } from 'schemas/types';

/** Quick edit asks for every required field so the record can be saved. */
export function getQuickEditFieldnames(
  schema: Schema,
  hideFields: string[] = [],
  showFields: string[] = []
): string[] {
  const fieldnames = (schema.quickEditFields ?? ['name']).filter(
    (fieldname) => !hideFields.includes(fieldname)
  );
  // The header asks for the field a manually named document is named by.
  const titleField = schema.naming === 'manual' ? schema.titleField : 'name';

  for (const field of schema.fields) {
    const { fieldname } = field;
    const isRequired =
      (needsInput(field) && fieldname !== titleField) ||
      (field.isCustom && field.required);
    const isAsked =
      showFields.includes(fieldname) ||
      (isRequired && !hideFields.includes(fieldname));
    if (isAsked && !fieldnames.includes(fieldname)) {
      fieldnames.push(fieldname);
    }
  }

  return fieldnames;
}

/** A row editor shows the row's usual columns, then its custom fields. */
export function getRowEditFieldnames(schema: Schema): string[] {
  const fieldnames = [...(schema.quickEditFields ?? schema.tableFields ?? [])];
  for (const field of schema.fields) {
    const isAsked = field.isCustom || needsInput(field);
    if (isAsked && !fieldnames.includes(field.fieldname)) {
      fieldnames.push(field.fieldname);
    }
  }

  return fieldnames;
}

/** Required fields nothing else fills in. */
function needsInput(field: Field): boolean {
  const hasDefault = field.default != null && field.default !== '';
  return (
    !!field.required &&
    !hasDefault &&
    !field.meta &&
    !field.readOnly &&
    !field.computed &&
    field.fieldname !== 'name'
  );
}
