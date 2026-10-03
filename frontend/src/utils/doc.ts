import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import { getDocPermissions } from 'src/frappe/api';
import { call } from 'src/web/api';

/** Loads the user's rights on a saved document, which shares, ownership and user permissions change. */
export async function loadDocPermissions(doc: FrappeDoc) {
  const doctype = doc.fyo.store.permissions?.doctypes[doc.schemaName];
  if (!doctype || doc.notInserted) {
    return;
  }

  doc.docPermissions = await getDocPermissions(doctype, doc.name!);
}

/**
 * Point a parent document's link field at a record created from a quick edit.
 * The parent may reject the value, so the failure is shown instead of dropped.
 */
export async function setLinkOnParent(
  parentDoc: FrappeDoc | undefined,
  fieldname: string | undefined,
  name: string
) {
  if (!parentDoc || !fieldname) {
    return;
  }

  try {
    await parentDoc.set(fieldname, name);
  } catch (error) {
    const { handleError } = await import('src/errorHandling');
    await handleError(false, error as Error);
  }
}

/**
 * Link a record created from a link control to the parent that was open when
 * it was created, even if the control has unmounted before the record saves.
 */
export function linkOnSave(
  doc: FrappeDoc,
  parentDoc: FrappeDoc | undefined,
  fieldname: string | undefined,
  afterLink: (name: string) => void
) {
  doc.once('afterSync', async () => {
    await setLinkOnParent(parentDoc, fieldname, doc.name!);
    afterLink(doc.name!);
  });
}

/** Names of the documents linking to `doc`, newest first, by schema in schema order. */
export async function getLinkedEntries(
  doc: FrappeDoc
): Promise<Record<string, string[]>> {
  const doctypes = doc.fyo.store.permissions?.doctypes ?? {};
  const linked = await call<Record<string, string[]>>(
    'frappe_books.linked_entries.get_linked_entries',
    { doctype: doctypes[doc.schemaName], name: doc.name }
  );

  const entries: Record<string, string[]> = {};
  for (const [schemaName, doctype] of Object.entries(doctypes)) {
    const names = linked[doctype ?? ''];
    if (names?.length) {
      entries[schemaName] = names;
    }
  }

  return entries;
}

/** Whether a field holds a value worth showing; an unchecked box does not. */
export function hasFieldValue(doc: FrappeDoc, field: Field): boolean {
  const value = doc.get(field.fieldname);
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return (
    value !== null && value !== undefined && value !== '' && value !== false
  );
}
