import { Doc } from 'fyo/model/doc';
import type { DocPermissionMap } from 'fyo/utils/permissions';
import { Field } from 'schemas/types';
import { call } from 'src/web/api';

/** Loads the user's rights on a saved document, which shares, ownership and user permissions change. */
export async function loadDocPermissions(doc: Doc) {
  const doctype = doc.fyo.store.permissions?.doctypes[doc.schemaName];
  if (!doctype || doc.notInserted) {
    return;
  }

  const { permissions } = await call<{ permissions: DocPermissionMap }>(
    'frappe.client.get_doc_permissions',
    { doctype, docname: doc.name }
  );
  doc.docPermissions = permissions;
}

/**
 * Point a parent document's link field at a record created from a quick edit.
 * The parent may reject the value, so the failure is shown instead of dropped.
 */
export async function setLinkOnParent(
  parentDoc: Doc | undefined,
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
  doc: Doc,
  parentDoc: Doc | undefined,
  fieldname: string | undefined,
  afterLink: (name: string) => void
) {
  doc.once('afterSync', async () => {
    await setLinkOnParent(parentDoc, fieldname, doc.name!);
    afterLink(doc.name!);
  });
}

export function evaluateReadOnly(field: Field, doc?: Doc) {
  const isSetOnce = field.setOnlyOnce || field.fieldname === 'numberSeries';
  if (doc?.inserted && isSetOnce) {
    return true;
  }

  if (
    field.fieldname === 'name' &&
    (doc?.inserted || doc?.schema.naming !== 'manual')
  ) {
    return true;
  }

  if (doc?.isSubmitted || doc?.parentdoc?.isSubmitted) {
    return true;
  }

  if (doc?.isCancelled || doc?.parentdoc?.isCancelled) {
    return true;
  }

  if (doc && !doc.canWrite) {
    return true;
  }

  return evaluateFieldMeta(field, doc, 'readOnly');
}

export function evaluateHidden(field: Field, doc?: Doc) {
  return evaluateFieldMeta(field, doc, 'hidden');
}

export function evaluateRequired(field: Field, doc?: Doc) {
  return evaluateFieldMeta(field, doc, 'required');
}

function evaluateFieldMeta(
  field: Field,
  doc?: Doc,
  meta?: 'required' | 'hidden' | 'invisible' | 'readOnly',
  defaultValue = false
) {
  if (meta === undefined) {
    return defaultValue;
  }

  const value = field[meta];
  if (value !== undefined) {
    return value;
  }

  const docRecord = doc as Record<string, unknown> | undefined;
  const metaKey = meta as string;
  const metaObj = docRecord?.[metaKey] as
    | Record<string, (() => boolean) | undefined>
    | undefined;
  const evalFunction = metaObj?.[field.fieldname];
  if (typeof evalFunction === 'function') {
    return evalFunction();
  }

  return defaultValue;
}

/** Names of the documents linking to `doc`, newest first, by schema. */
export async function getLinkedEntries(
  doc: Doc
): Promise<Record<string, string[]>> {
  return await doc.fyo.db.getLinkedEntries(doc.schemaName, doc.name!);
}
