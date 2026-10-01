import { loadDocPermissions } from 'src/utils/doc';
import type { DocRef } from 'src/utils/types';
import { ref } from 'vue';
import { getFrappeDoc, getFrappeDocOrNew } from './documents';

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
