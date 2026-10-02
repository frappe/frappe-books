import type { FrappeDoc } from 'src/frappe/document';
import { Keys } from 'utils/types';
import {
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  reactive,
} from 'vue';
import { getIsMac } from './misc';
import { Shortcuts } from './shortcuts';
import { DocRef } from './types';
import {
  commonDocCancel,
  commonDocSubmit,
  commonDocSync,
  commonDocDelete,
  showCannotCancelOrDeleteToast,
  showCannotSaveOrSubmitToast,
} from './ui';

export function useKeys() {
  const isMac = getIsMac();
  const keys: Keys = reactive({
    pressed: new Set<string>(),
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
    repeat: false,
  });

  const keydownListener = (e: KeyboardEvent) => {
    const notMods = !(e.altKey || e.metaKey || e.ctrlKey);
    if (e.target instanceof HTMLInputElement && notMods) {
      return;
    }

    if (
      e.target instanceof HTMLElement &&
      e.target.contentEditable === 'true' &&
      notMods
    ) {
      return;
    }

    keys.alt = e.altKey;
    keys.ctrl = e.ctrlKey;
    keys.meta = e.metaKey;
    keys.shift = e.shiftKey;
    keys.repeat = e.repeat;

    const { code } = e;
    if (
      code.startsWith('Alt') ||
      code.startsWith('Control') ||
      code.startsWith('Meta') ||
      code.startsWith('Shift')
    ) {
      return;
    }

    keys.pressed.add(code);
  };

  const keyupListener = (e: KeyboardEvent) => {
    const { code } = e;
    if (code.startsWith('Meta') && isMac) {
      keys.alt = false;
      keys.ctrl = false;
      keys.meta = false;
      keys.shift = false;
      keys.repeat = false;
      keys.pressed.clear();
      return;
    }

    keys.pressed.delete(code);
  };

  onMounted(() => {
    window.addEventListener('keydown', keydownListener);
    window.addEventListener('keyup', keyupListener);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', keydownListener);
    window.removeEventListener('keyup', keyupListener);
  });

  return keys;
}

/** What the save shortcut does: save the doc, else submit it, else say it cannot. */
export async function syncOrSubmitDoc(doc: FrappeDoc) {
  if (doc.canSave) {
    return await commonDocSync(doc, true);
  }

  if (doc.canSubmit) {
    return await commonDocSubmit(doc);
  }

  showCannotSaveOrSubmitToast(doc);
}

export function useDocShortcuts(
  shortcuts: Shortcuts,
  docRef: DocRef,
  name: string,
  isMultiple = true
) {
  let context = name;
  if (isMultiple) {
    context = name + '-' + Math.random().toString(36).slice(2, 6);
  }

  const syncOrSubmitCallback = async () => {
    if (docRef.value) {
      await syncOrSubmitDoc(docRef.value);
    }
  };

  const cancelOrDeleteCallback = async () => {
    const doc = docRef.value;
    if (!doc) {
      return;
    }

    if (doc.canCancel) {
      return await commonDocCancel(doc);
    }

    if (doc.canDelete) {
      return await commonDocDelete(doc);
    }

    showCannotCancelOrDeleteToast(doc);
  };

  onMounted(() => {
    if (isMultiple && shortcuts.has(context)) {
      return;
    }

    shortcuts.pmod.set(context, ['KeyS'], syncOrSubmitCallback, false);
    shortcuts.pmod.set(context, ['Backspace'], cancelOrDeleteCallback, false);
  });

  onActivated(() => {
    if (isMultiple && shortcuts.has(context)) {
      return;
    }

    shortcuts.pmod.set(context, ['KeyS'], syncOrSubmitCallback, false);
    shortcuts.pmod.set(context, ['Backspace'], cancelOrDeleteCallback, false);
  });

  onDeactivated(() => {
    if (!shortcuts.has(context)) {
      return;
    }

    shortcuts.delete(context);
  });

  onUnmounted(() => {
    if (!shortcuts.has(context)) {
      return;
    }

    shortcuts.delete(context);
  });

  return context;
}
