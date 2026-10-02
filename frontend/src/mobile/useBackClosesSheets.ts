import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

/**
 * The phone's back gesture closes the top sheet, menu or picker before it
 * leaves the page. Sheets that are routes themselves close by navigating.
 */
export function useBackClosesSheets() {
  const router = useRouter();
  let position = getHistoryPosition();

  const removeAfterEach = router.afterEach(() => {
    position = getHistoryPosition();
  });

  const removeBeforeEach = router.beforeEach((to, from) => {
    // A back press has already moved history to an earlier entry.
    const isBack = getHistoryPosition() < position;
    if (!isBack || to.path === from.path) {
      return true;
    }

    // Menus open after the sheet they belong to, so the last one is on top.
    const layers = document.querySelectorAll<HTMLElement>(
      '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]'
    );
    const top = layers[layers.length - 1];
    if (!top) {
      return true;
    }

    // Dismissible sheets and menus close on Escape; confirmations stay until answered.
    top.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    return false;
  });

  onBeforeUnmount(() => {
    removeAfterEach();
    removeBeforeEach();
  });
}

/** vue-router numbers each history entry it creates. */
function getHistoryPosition(): number {
  const state = history.state as { position?: number } | null;
  return state?.position ?? 0;
}
