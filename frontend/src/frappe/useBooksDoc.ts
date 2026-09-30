import type { DocValueMap, RawValueMap } from 'fyo/core/types';
import type { Doc } from 'fyo/model/doc';
import { NotFoundError } from 'fyo/utils/errors';
import { fyo } from 'src/initFyo';
import { loadDocPermissions } from 'src/utils/doc';
import type { DocRef } from 'src/utils/types';
import { ref } from 'vue';
import { FrappeDoc } from './document';
import { isFrappeBacked } from './doctypes';
import { getFrappeDoc, getFrappeDocOrNew, newFrappeDoc } from './documents';

/**
 * A form's document with the user's rights on it. A Frappe-backed schema
 * gives a `FrappeDoc`, the others a bridge `Doc`; both save, submit, cancel,
 * delete and track unsaved edits the same way, so a form handles either.
 */
export function useBooksDoc() {
  const doc = ref(null) as DocRef;

  /** Loads the saved document, or a new one when `create` and none is saved by `name`. */
  async function load(schemaName: string, name?: string, create = false) {
    const loaded = create
      ? await getBooksDocOrNew(schemaName, name)
      : await getBooksDoc(schemaName, name!);
    await loadDocPermissions(loaded);
    // A new document shows what the server fills, like its number series, once it opens.
    if (loaded instanceof FrappeDoc && loaded.notInserted) {
      loaded.schedulePreview();
    }

    doc.value = loaded;
    // A new document shows what the server fills, like its defaults, from the start.
    if (loaded instanceof FrappeDoc && loaded.notInserted) {
      loaded.schedulePreview(0);
    }
  }

  return { doc, load };
}

export function newBooksDoc(
  schemaName: string,
  values: DocValueMap | RawValueMap = {}
): Doc {
  if (isFrappeBacked(schemaName)) {
    return newFrappeDoc(schemaName, values as DocValueMap);
  }

  return fyo.doc.getNewDoc(schemaName, values);
}

/** An open or saved document, reloaded when asked and unedited. */
export async function getBooksDoc(
  schemaName: string,
  name: string,
  options: { refresh?: boolean } = {}
): Promise<Doc> {
  if (isFrappeBacked(schemaName)) {
    return await getFrappeDoc(schemaName, name, options);
  }

  return await fyo.doc.getDoc(schemaName, name, options);
}

/** The saved document by `name`, or a new one when there is none. */
export async function getBooksDocOrNew(
  schemaName: string,
  name?: string
): Promise<Doc> {
  if (isFrappeBacked(schemaName)) {
    return await getFrappeDocOrNew(schemaName, name);
  }

  if (!name) {
    return fyo.doc.getNewDoc(schemaName);
  }

  try {
    return await fyo.doc.getDoc(schemaName, name, { refresh: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return fyo.doc.getNewDoc(schemaName);
    }

    throw error;
  }
}
