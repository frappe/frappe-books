import type { DocValueMap } from 'fyo/core/types';
import { NotFoundError } from 'fyo/utils/errors';
import { fyo } from 'src/initFyo';
import type { FrappeDoc } from './document';
import { getDocType } from './doctypes';
import { getNamingField } from './schema';

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

  const doc = new Model(schema, values, fyo, false) as FrappeDoc;
  doc.name ??= fyo.doc.getTemporaryName(schema);
  keep(doc);
  return doc;
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
  const doc = new Model(schema, { name }, fyo, false) as FrappeDoc;
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
  // A saved document is found by its saved name, not its temporary one.
  doc.on('afterSync', () => {
    forgetFrappeDoc(doc);
    docs.set(getKey(doc.schemaName, doc.name!), doc);
  });
}

function getKey(schemaName: string, name: string): string {
  return `${schemaName}\u0000${name}`;
}
