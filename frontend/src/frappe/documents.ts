import type { DocValueMap } from 'fyo/core/types';
import { NotFoundError } from 'fyo/utils/errors';
import { getIsNullOrUndef } from 'utils';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import type { DocValues } from './api';
import type { FrappeDoc } from './document';
import { getDocType } from './doctypes';
import { getNamingField } from './schema';
import { toDocValues } from './values';

/** Open Frappe documents by schema and name, so a form, a quick edit and a link share one. */
const docs = new Map<string, FrappeDoc>();

/**
 * An unsaved document with its defaults and `values`, kept until it is saved
 * or dropped. A name given for a document named by a field goes in that field.
 */
export function newFrappeDoc(
  schemaName: string,
  values: DocValueMap = {}
): FrappeDoc {
  const { Model, schema, meta } = getDocType(schemaName);
  const namingField = getNamingField(meta);
  if (namingField && values.name) {
    values = { ...values, [namingField]: values.name };
  }

  const doc = new Model(schema, values, fyo) as FrappeDoc;
  doc.name ??= fyo.getTemporaryName(schema);
  doc.leaveToServer(
    Model.serverDefaults.filter((fieldname) => !(fieldname in values))
  );
  keep(doc);
  return doc;
}

/** What a whitelisted server mapper, like an invoice's make_payment, builds from `sourceName`. */
export async function getMapperValues(
  method: string,
  sourceName: string
): Promise<DocValues> {
  return await call<DocValues>('frappe.model.mapper.make_mapped_doc', {
    method,
    source_name: sourceName,
  });
}

/** The unsaved document a whitelisted server mapper, like an invoice's make_payment, builds. */
export async function getMappedFrappeDoc(
  schemaName: string,
  method: string,
  sourceName: string
): Promise<FrappeDoc> {
  const mapped = await getMapperValues(method, sourceName);
  const values = toDocValues(
    getDocType(schemaName).schema,
    mapped,
    fyo,
    (target) => getDocType(target).schema
  );
  // Values the mapper left unset keep the new document's defaults.
  const setValues = Object.entries(values).filter(
    ([, value]) => !getIsNullOrUndef(value)
  );
  return newFrappeDoc(schemaName, Object.fromEntries(setValues));
}

/** An open document, reloaded if asked and unedited, or the saved one loaded. */
export async function getFrappeDoc(
  schemaName: string,
  name: string,
  options: { refresh?: boolean } = {}
): Promise<FrappeDoc> {
  const open = docs.get(getKey(schemaName, name));
  if (open) {
    if (options.refresh) {
      await open.refresh();
    }

    return open;
  }

  const { Model, schema } = getDocType(schemaName);
  const doc = new Model(schema, { name }, fyo) as FrappeDoc;
  await doc.load();
  keep(doc);
  return doc;
}

/** The open document, the saved one, or a new one when there is no saved one by `name`. */
export async function getFrappeDocOrNew(
  schemaName: string,
  name?: string
): Promise<FrappeDoc> {
  if (!name) {
    return newFrappeDoc(schemaName);
  }

  try {
    return await getFrappeDoc(schemaName, name, { refresh: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return newFrappeDoc(schemaName);
    }

    throw error;
  }
}

export function forgetFrappeDoc(doc: FrappeDoc) {
  for (const [key, open] of docs) {
    if (open === doc) {
      docs.delete(key);
    }
  }
}

/** The open documents of a schema, e.g. to show a customized form. */
export function getOpenFrappeDocs(schemaName: string): FrappeDoc[] {
  return [...docs.values()].filter((doc) => doc.schemaName === schemaName);
}

function keep(doc: FrappeDoc) {
  docs.set(getKey(doc.schemaName, doc.name!), doc);
  // Settings are read from `fyo.singles`; it holds the same open document.
  if (doc.schema.isSingle) {
    fyo.singles[doc.schemaName] = doc;
  }

  // A saved document is found by its saved name, not its temporary one.
  doc.on('afterSync', () => {
    forgetFrappeDoc(doc);
    docs.set(getKey(doc.schemaName, doc.name!), doc);
  });
}

function getKey(schemaName: string, name: string): string {
  return `${schemaName}\u0000${name}`;
}
