<template>
  <div class="flex flex-col gap-2.5 border-b border-outline-gray-1 px-4 py-3">
    <div class="flex gap-2">
      <FrappeTextInput
        type="search"
        size="lg"
        variant="subtle"
        class="min-w-0 flex-1"
        :model-value="search"
        :placeholder="t`Search`"
        :aria-label="t`Search`"
        @update:model-value="onSearch"
      >
        <template #prefix>
          <span
            aria-hidden="true"
            class="lucide-search size-4 text-ink-gray-5"
          />
        </template>
      </FrappeTextInput>
      <FrappeButton
        v-if="chips.length"
        size="lg"
        icon-left="lucide-list-filter"
        :label="t`Filters (${chips.length})`"
        @click="isSheetOpen = true"
      >
        {{ chips.length }}
      </FrappeButton>
      <FrappeButton
        v-else
        size="lg"
        icon="lucide-list-filter"
        :label="t`Filters`"
        @click="isSheetOpen = true"
      />
    </div>
    <div v-if="chips.length" class="-mx-4 flex gap-2 overflow-x-auto px-4">
      <span
        v-for="chip in chips"
        :key="chip.id"
        class="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-gray-2 pe-0.5 ps-3 text-sm text-ink-gray-8"
      >
        <span class="text-ink-gray-5">{{ chip.label }}</span>
        {{ chip.value }}
        <FrappeButton
          variant="ghost"
          size="sm"
          icon="lucide-x"
          :label="t`Remove filter ${chip.label}`"
          @click="removeFilter(chip.id)"
        />
      </span>
    </div>
  </div>
  <MobileFilterSheet
    v-model:open="isSheetOpen"
    :filters="filters as ListFilters"
    @apply="onApply"
  />
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { t } from 'fyo';
import { getOptionList } from 'fyo/utils';
import type { Field } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { getFieldLabel } from 'src/utils/filterFields';
import {
  filterConditions,
  isValuelessCondition,
  mergeQueryFilters,
  type FilterRow,
} from 'src/utils/filterQuery';
import { ListFilters } from 'src/utils/listFilters';
import type { QueryFilter } from 'utils/db/types';
import { defineComponent } from 'vue';
import MobileFilterSheet from './MobileFilterSheet.vue';

/** Search box, Filters button and filter chips above a phone list. */
export default defineComponent({
  name: 'MobileListToolbar',
  components: { FrappeButton, FrappeTextInput, MobileFilterSheet },
  props: {
    schemaName: { type: String, required: true },
    searchField: { type: String, required: true },
  },
  emits: ['change'],
  data() {
    return {
      filters: new ListFilters(this.schemaName),
      filterQuery: {} as QueryFilter,
      search: '',
      searchTimer: 0,
      isSheetOpen: false,
    };
  },
  computed: {
    chips(): { id: number; label: string; value: string }[] {
      return this.filters.applied.map((row) => {
        const field = this.filters.fieldFor(row);
        return {
          id: row.id,
          label: field ? getFieldLabel(field) : row.fieldname,
          value: getChipValue(row, field),
        };
      });
    },
    searchQuery(): QueryFilter {
      const text = this.search.trim();
      return text ? { [this.searchField]: ['like', `%${text}%`] } : {};
    },
  },
  methods: {
    onSearch(value: string) {
      this.search = value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(this.emitChange, 300);
    },
    onApply(query: QueryFilter) {
      this.filterQuery = query;
      this.emitChange();
    },
    removeFilter(id: number) {
      this.filters.remove(id);
      const query = this.filters.apply();
      if (query) this.onApply(query);
    },
    clear() {
      window.clearTimeout(this.searchTimer);
      this.search = '';
      this.filters.clear();
      this.onApply(this.filters.apply() ?? {});
    },
    emitChange() {
      this.$emit(
        'change',
        mergeQueryFilters(this.filterQuery, this.searchQuery)
      );
    },
  },
});

function getChipValue(row: FilterRow, field?: Field): string {
  const condition = filterConditions.find(
    ({ value }) => value === row.condition
  );
  const prefix = row.condition === '=' ? '' : (condition?.label ?? '');
  if (isValuelessCondition(row.condition)) {
    return prefix;
  }

  return [prefix, formatFilterValue(row.value, field)]
    .filter(Boolean)
    .join(' ');
}

function formatFilterValue(value: FilterRow['value'], field?: Field): string {
  if (field?.fieldtype === 'Check') {
    return [true, 1, '1'].includes(value as string) ? t`Yes` : t`No`;
  }

  if (field?.fieldtype === 'Date' || field?.fieldtype === 'Datetime') {
    return fyo.format(value, field);
  }

  const option = field
    ? getOptionList(field, undefined).find((option) => option.value === value)
    : undefined;
  return option?.label ?? String(value);
}
</script>
