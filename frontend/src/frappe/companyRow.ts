import type { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from './document';

/**
 * Fields a form shows for the company /books works on that live in a
 * per-company table, like a customer's Account in its `accounts` rows. Rows
 * of other companies are never shown or changed; the server checks the rows
 * on save as it does for any caller.
 */

/** The table's row of the company; the rows all belong to the one company. */
export function getCompanyRow(
  doc: FrappeDoc,
  tableField: string
): FrappeDoc | undefined {
  return ((doc[tableField] ?? []) as FrappeDoc[])[0];
}

export function getCompanyRowValue(
  doc: FrappeDoc,
  tableField: string,
  fieldname: string
): DocValue {
  return (getCompanyRow(doc, tableField)?.[fieldname] ?? null) as DocValue;
}

/** Sets a value of the current company's row: a value makes the row, and a row left with no values goes. */
export function setCompanyRowValue(
  doc: FrappeDoc,
  tableField: string,
  fieldname: string,
  value: DocValue
) {
  const empty = value === null || value === undefined || value === '';
  if ((value ?? null) === getCompanyRowValue(doc, tableField, fieldname)) {
    return;
  }

  const row = getCompanyRow(doc, tableField);
  if (!row) {
    if (!empty) {
      doc.push(tableField, { [fieldname]: value });
    }
    return;
  }

  row[fieldname] = empty ? null : value;
  // The user's value, which a preview no longer refills.
  row._serverFilled.delete(fieldname);
  if (isEmptyRow(row)) {
    const rows = (doc[tableField] as FrappeDoc[]).filter((r) => r !== row);
    rows.forEach((r, idx) => (r.idx = idx));
    doc[tableField] = rows;
  }
}

/** A row holds no values but its company, like a row whose only account was cleared. */
function isEmptyRow(row: FrappeDoc): boolean {
  return row.schema.fields
    .filter((field) => !field.meta && field.fieldname !== 'company')
    .every((field) => {
      const value = row[field.fieldname];
      return [null, undefined, '', false, 0].includes(value as never);
    });
}
