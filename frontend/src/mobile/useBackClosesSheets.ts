import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

/**
 * The phone's back gesture closes the top sheet, drawer or picker before it
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

    const dialogs = document.querySelectorAll<HTMLElement>(
      '[role="dialog"][data-state="open"]'
    );
    const top = dialogs[dialogs.length - 1];
    if (!top) {
      return true;
    }

    // Dismissible sheets close on Escape; confirmations stay until answered.
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
