import type { DocValueMap } from 'fyo/core/types';
import type { Doc } from 'fyo/model/doc';
import { loadDocPermissions } from 'src/utils/doc';
import type { DocRef } from 'src/utils/types';
import { ref } from 'vue';
import { getFrappeDoc, getFrappeDocOrNew, newFrappeDoc } from './documents';

/** A form's document with the user's rights on it. */
export function useBooksDoc() {
  const doc = ref(null) as DocRef;

  /** Loads the saved document, or a new one when `create` and none is saved by `name`. */
  async function load(schemaName: string, name?: string, create = false) {
    const loaded = create
      ? await getFrappeDocOrNew(schemaName, name)
      : await getFrappeDoc(schemaName, name!);
    await loadDocPermissions(loaded);
    doc.value = loaded;
    // A new document shows what the server fills, like its number series and defaults, from the start.
    if (loaded.notInserted) {
      loaded.schedulePreview(0);
    }
  }

  return { doc, load };
}

export function newBooksDoc(schemaName: string, values: DocValueMap = {}): Doc {
  return newFrappeDoc(schemaName, values);
}

/** An open or saved document, reloaded when asked and unedited. */
export async function getBooksDoc(
  schemaName: string,
  name: string,
  options: { refresh?: boolean } = {}
): Promise<Doc> {
  return await getFrappeDoc(schemaName, name, options);
}

/** The saved document by `name`, or a new one when there is none. */
export async function getBooksDocOrNew(
  schemaName: string,
  name?: string
): Promise<Doc> {
  return await getFrappeDocOrNew(schemaName, name);
}
