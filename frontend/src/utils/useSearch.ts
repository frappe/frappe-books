import { handleError } from 'src/errorHandling';
import { computed, inject, onUnmounted, ref, watch } from 'vue';
import { searcherKey } from './injectionKeys';
import type { SearchItems } from './search';

const FETCH_DELAY = 250;

/** Query, results and filters of the global search index. */
export function useSearch() {
  const searcher = inject(searcherKey, ref(null));
  const query = ref('');
  // The web app keeps Search in a shallow ref; track filter mutations here.
  const revision = ref(0);
  let fetchTimer: ReturnType<typeof setTimeout> | undefined;

  const results = computed<SearchItems>(() => {
    void revision.value;
    return searcher.value?.search(query.value) ?? [];
  });

  async function fetchDocs() {
    try {
      if (await searcher.value?.fetchDocs(query.value)) {
        revision.value += 1;
      }
    } catch (error) {
      await handleError(false, error as Error);
    }
  }

  function isFilterOn(filterName: string): boolean {
    void revision.value;
    return searcher.value?.isFilterOn(filterName) ?? false;
  }

  function setSearchFilter(filterName: string, value: boolean) {
    searcher.value?.set(filterName, value);
    revision.value += 1;
    void fetchDocs();
  }

  function resetSearchFilters() {
    searcher.value?.resetFilters();
    revision.value += 1;
    void fetchDocs();
  }

  function openSearchItem(item: SearchItems[number]) {
    if (!item.action) {
      return;
    }

    searcher.value?.addToRecent(item);
    void item.action();
  }

  watch(query, () => {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => void fetchDocs(), FETCH_DELAY);
  });
  onUnmounted(() => clearTimeout(fetchTimer));

  return {
    searcher,
    query,
    results,
    revision,
    isFilterOn,
    setSearchFilter,
    resetSearchFilters,
    openSearchItem,
  };
}
