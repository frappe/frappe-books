<template>
  <div class="flex min-h-full flex-col">
    <PageHeader :title="t`Search`" />

    <div
      class="sticky top-0 z-10 border-b border-outline-gray-1 bg-surface-base"
    >
      <div class="px-4 pt-2">
        <FrappeTextInput
          ref="input"
          v-model="query"
          type="search"
          enterkeyhint="search"
          size="lg"
          variant="subtle"
          :placeholder="t`Type to search...`"
          :aria-label="t`Search Frappe Books`"
          @keydown.enter="input?.inputElement?.blur()"
        >
          <template #prefix>
            <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
          </template>
        </FrappeTextInput>
      </div>
      <div class="flex items-center">
        <div
          class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-2.5 pe-2 ps-4 pt-2 [scrollbar-width:none]"
        >
          <FrappeButton
            v-for="group in groups"
            :key="group"
            class="shrink-0"
            size="md"
            :variant="isFilterOn(group) ? 'subtle' : 'outline'"
            :aria-pressed="isFilterOn(group)"
            :label="groupLabelMap[group]"
            @click="setSearchFilter(group, !isFilterOn(group))"
          />
        </div>
        <div
          class="mb-2.5 me-3 mt-2 shrink-0 border-s border-outline-gray-1 ps-1"
        >
          <FrappeButton
            size="md"
            variant="ghost"
            icon-left="lucide-sliders-horizontal"
            :label="
              changedFilterCount
                ? t`Filters · ${changedFilterCount}`
                : t`Filters`
            "
            @click="isFilterSheetOpen = true"
          />
        </div>
      </div>
    </div>

    <p
      v-if="!resultsQuery && rows.length"
      class="px-4 pb-1.5 pt-3.5 text-sm text-ink-gray-5"
    >
      {{ t`Recent` }}
    </p>
    <FrappeList
      v-if="rows.length"
      class="list-row-px-4"
      :columns="['minmax(0,1fr)', 'auto']"
      :aria-label="t`Results`"
    >
      <FrappeListRow
        v-for="(item, index) in rows"
        :key="`${index}-${item.label}`"
        class="min-h-14 py-2"
        @click="openSearchItem(item)"
      >
        <FrappeListCell>
          <div class="min-w-0">
            <div class="truncate text-lg text-ink-gray-8">{{ item.label }}</div>
            <div
              v-if="getDetail(item)"
              class="mt-0.5 truncate text-md text-ink-gray-5"
            >
              {{ getDetail(item) }}
            </div>
          </div>
        </FrappeListCell>
        <FrappeListCell class="justify-end">
          <FrappeBadge :theme="groupThemeMap[item.group]" class="max-w-[132px]">
            <span class="truncate">{{ getBadgeLabel(item) }}</span>
          </FrappeBadge>
        </FrappeListCell>
      </FrappeListRow>
    </FrappeList>

    <div
      v-if="resultsQuery && total"
      class="flex flex-col items-center gap-2.5 px-4 pb-10 pt-4"
    >
      <!-- The count only matters while some results are hidden. -->
      <template v-if="rows.length < total">
        <p class="text-sm tabular-nums text-ink-gray-5">
          {{ t`${rows.length} out of ${total}` }}
        </p>
        <FrappeButton
          size="lg"
          :label="t`Show all`"
          @click="showAll = true"
        />
      </template>
    </div>
    <MobileEmptyState
      v-else-if="resultsQuery"
      class="flex-1 pb-40 pt-8"
      icon="lucide-search-x"
      :title="t`No results`"
    >
      <FrappeButton
        v-if="changedFilterCount"
        class="mt-2"
        size="lg"
        :label="t`Reset filters`"
        @click="resetSearchFilters"
      />
    </MobileEmptyState>

    <SearchFilterSheet
      v-model:open="isFilterSheetOpen"
      :schema-filters="searcher?.schemaFilterOptions ?? []"
      :is-filter-on="isFilterOn"
      @change="setSearchFilter"
    />
  </div>
</template>
<script setup lang="ts">
import {
  Badge as FrappeBadge,
  Button as FrappeButton,
  Icon as FrappeIcon,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import PageHeader from 'src/components/PageHeader.vue';
import { historyState } from 'src/utils/refs';
import {
  getGroupLabelMap,
  groupThemeMap,
  searchGroups,
  type SearchItems,
} from 'src/utils/search';
import { useSearch } from 'src/utils/useSearch';
import {
  computed,
  nextTick,
  onActivated,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';
import { isDesktopOnly } from '../availability';
import MobileEmptyState from '../MobileEmptyState.vue';
import SearchFilterSheet from './SearchFilterSheet.vue';

type SearchItem = SearchItems[number];

const PAGE_SIZE = 50;

const router = useRouter();
const {
  searcher,
  query,
  resultsQuery,
  results,
  revision,
  isFilterOn,
  setSearchFilter,
  resetSearchFilters,
  openSearchItem,
} = useSearch();
const groupLabelMap = getGroupLabelMap();
const groups = searchGroups.filter((group) => group !== 'Recent');
const input = useTemplateRef<InstanceType<typeof FrappeTextInput>>('input');
const isFilterSheetOpen = ref(false);
const showAll = ref(false);

const matches = computed(() =>
  results.value.filter(
    (item) =>
      (resultsQuery.value || item.group === 'Recent') && isPhonePage(item)
  )
);
const total = computed(() => matches.value.length);
const rows = computed(() =>
  showAll.value ? matches.value : matches.value.slice(0, PAGE_SIZE)
);
const changedFilterCount = computed(() => {
  void revision.value;
  return searcher.value?.changedFilterCount ?? 0;
});

watch(query, () => (showAll.value = false));

onActivated(async () => {
  // Coming back from a result keeps the search; a new visit starts fresh.
  if (historyState.forward) {
    return;
  }

  query.value = '';
  await nextTick();
  input.value?.focus();
});

function isPhonePage(item: SearchItem): boolean {
  return !item.route || !isDesktopOnly(router.resolve(item.route));
}

function getDetail(item: SearchItem): string {
  return item.group === 'Docs' ? item.more.filter(Boolean).join(', ') : '';
}

function getBadgeLabel(item: SearchItem): string {
  return item.group === 'Docs' ? item.schemaLabel : groupLabelMap[item.group];
}
</script>
