<template>
  <div class="flex min-h-full flex-col">
    <PageHeader>
      <template #mobile-bar>
        <FrappeTextInput
          ref="input"
          v-model="query"
          type="search"
          enterkeyhint="search"
          size="lg"
          variant="outline"
          class="min-w-0 flex-1"
          :placeholder="t`Type to search...`"
          :aria-label="t`Search Frappe Books`"
          @keydown.enter="input?.inputElement?.blur()"
        >
          <template #prefix>
            <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
          </template>
        </FrappeTextInput>
      </template>
    </PageHeader>

    <div
      class="sticky top-0 z-10 flex items-center border-b border-outline-gray-1 bg-surface-base"
    >
      <div
        class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-2.5 pe-2 ps-4 pt-1 [scrollbar-width:none]"
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
      <div class="mb-2.5 me-3 mt-1 shrink-0 border-s border-outline-gray-1 ps-1">
        <FrappeButton
          size="md"
          variant="ghost"
          icon-left="lucide-sliders-horizontal"
          :label="
            changedFilterCount ? t`Filters · ${changedFilterCount}` : t`Filters`
          "
          @click="isFilterSheetOpen = true"
        />
      </div>
    </div>

    <p
      v-if="!query && rows.length"
      class="px-4 pb-1.5 pt-3.5 text-sm-medium text-ink-gray-5"
    >
      {{ t`Recent` }}
    </p>
    <ul v-if="rows.length" :aria-label="t`Results`">
      <li v-for="(item, index) in rows" :key="`${index}-${item.label}`">
        <button
          type="button"
          class="flex min-h-14 w-full items-center gap-3 border-b border-outline-gray-1 px-4 py-2 text-start active:bg-surface-gray-1"
          @click="openSearchItem(item)"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="truncate text-md-medium text-ink-gray-9">
              {{ item.label }}
            </span>
            <span
              v-if="getDetail(item)"
              class="truncate text-sm text-ink-gray-5"
            >
              {{ getDetail(item) }}
            </span>
          </span>
          <FrappeBadge
            :theme="groupThemeMap[item.group]"
            class="max-w-[132px] shrink-0"
          >
            <span class="truncate">{{ getBadgeLabel(item) }}</span>
          </FrappeBadge>
        </button>
      </li>
    </ul>

    <div
      v-if="query && total"
      class="flex flex-col items-center gap-2.5 px-4 pb-10 pt-4"
    >
      <p class="text-sm tabular-nums text-ink-gray-5">
        {{ t`${rows.length} out of ${total}` }}
      </p>
      <FrappeButton
        v-if="rows.length < total"
        size="lg"
        :label="t`Show all`"
        @click="showAll = true"
      />
    </div>
    <div
      v-else-if="query"
      class="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-40 pt-8 text-center"
    >
      <FrappeIcon icon="lucide-search-x" class="size-7 text-ink-gray-4" />
      <p class="text-md-medium text-ink-gray-8">{{ t`No results` }}</p>
      <FrappeButton
        v-if="changedFilterCount"
        class="mt-1"
        size="lg"
        :label="t`Reset filters`"
        @click="resetSearchFilters"
      />
    </div>

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
import PageHeader from 'src/components/PageHeader.vue';
import { historyState } from 'src/utils/refs';
import {
  getGroupLabelMap,
  groupThemeMap,
  searchGroups,
  type SearchItems,
} from 'src/utils/search';
import { useSearch } from 'src/utils/useSearch';
import { computed, onActivated, ref, useTemplateRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { isDesktopOnly } from '../availability';
import SearchFilterSheet from './SearchFilterSheet.vue';

type SearchItem = SearchItems[number];

const PAGE_SIZE = 50;

const router = useRouter();
const {
  searcher,
  query,
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
    (item) => (query.value || item.group === 'Recent') && isPhonePage(item)
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

onActivated(() => {
  // Coming back from a result keeps the search; a new visit starts fresh.
  if (historyState.forward) {
    return;
  }

  query.value = '';
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
