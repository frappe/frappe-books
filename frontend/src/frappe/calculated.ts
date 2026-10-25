import type { Field } from 'schemas/types';
import { getFieldState } from './fieldState';
import type { FrappeDoc } from './document';

/** How a field the server calculates shows now: being calculated, failed, or its value. */
export type CalculatedState = 'calculating' | 'failed' | undefined;

/**
 * A read-only field of the model's `calculatedFields` is being calculated
 * while its document's preview is due. A row's is failed when the last
 * preview failed after the row was edited.
 */
export function getCalculatedState(
  doc: FrappeDoc,
  fieldname: string
): CalculatedState {
  const { calculatedFields } = doc.constructor as typeof FrappeDoc;
  const field = doc.fieldMap[fieldname];
  if (!field || !calculatedFields.includes(fieldname)) {
    return undefined;
  }

  if (!getFieldState(doc, field).readOnly) {
    return undefined;
  }

  const owner = doc.parentdoc ?? doc;
  if (owner.isCalculating) {
    return 'calculating';
  }

  return doc.parentdoc?.isRowFailed(doc) ? 'failed' : undefined;
}

/** Whether the server is working out the field's value; see `getCalculatedState`. */
export function isCalculating(doc: FrappeDoc, field: Field): boolean {
  return getCalculatedState(doc, field.fieldname) === 'calculating';
}
