import { handleError } from 'src/errorHandling';
import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import { searcherKey } from './injectionKeys';
import type { SearchItems } from './search';

const FETCH_DELAY = 250;

/** Query, results and filters of the global search index. */
export function useSearch() {
  const searcher = inject(searcherKey, ref(null));
  const query = ref('');
  // Results change once per query, when its documents arrive.
  const resultsQuery = ref('');
  // The web app keeps Search in a shallow ref; track filter mutations here.
  const revision = ref(0);
  let fetchTimer: ReturnType<typeof setTimeout> | undefined;

  const results = computed<SearchItems>(() => {
    void revision.value;
    return searcher.value?.search(resultsQuery.value) ?? [];
  });

  async function fetchDocs() {
    const text = query.value;
    try {
      if (!(await searcher.value?.fetchDocs(text))) {
        return;
      }
    } catch (error) {
      await handleError(false, error as Error);
    }

    resultsQuery.value = text;
    revision.value += 1;
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

  watch(query, (text) => {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => void fetchDocs(), text ? FETCH_DELAY : 0);
  });
  onScopeDispose(() => clearTimeout(fetchTimer));

  return {
    searcher,
    query,
    resultsQuery,
    results,
    revision,
    isFilterOn,
    setSearchFilter,
    resetSearchFilters,
    openSearchItem,
  };
}
