<template>
  <div
    class="sticky top-0 z-10 flex flex-col gap-2 border-b border-outline-gray-1 bg-surface-base px-4 py-2"
  >
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
      <MobileFiltersButton
        size="lg"
        :count="chips.length"
        @click="isSheetOpen = true"
      />
      <slot />
    </div>
    <div v-if="chips.length" class="-mx-4 flex gap-2 overflow-x-auto px-4">
      <MobileFilterChip
        v-for="chip in chips"
        :key="chip.id"
        :label="chip.label"
        :value="chip.value"
        @click="removeFilter(chip.id)"
      />
    </div>
  </div>
  <MobileFilterSheet
    v-model:open="isSheetOpen"
    :filters="filters as ListFilters"
    @apply="onApply"
  />
</template>
<script lang="ts">
import { TextInput as FrappeTextInput } from 'frappe-ui';
import { t } from 'fyo';
import { getOptionList } from 'fyo/utils';
import type { Field } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import { fyo } from 'src/initFyo';
import MobileFilterChip from 'src/mobile/MobileFilterChip.vue';
import MobileFiltersButton from 'src/mobile/MobileFiltersButton.vue';
import { getFieldLabel } from 'src/utils/filterFields';
import {
  filterConditions,
  isValuelessCondition,
  type FilterRow,
} from 'src/utils/filterQuery';
import { ListFilters } from 'src/utils/listFilters';
import { defineComponent, type PropType } from 'vue';
import MobileFilterSheet from './MobileFilterSheet.vue';

/** Search, Filters, the page's own buttons and filter chips above a phone list. */
export default defineComponent({
  name: 'MobileListToolbar',
  components: {
    FrappeTextInput,
    MobileFilterChip,
    MobileFilterSheet,
    MobileFiltersButton,
  },
  props: {
    schemaName: { type: String, required: true },
    searchFields: { type: Array as PropType<string[]>, required: true },
  },
  emits: ['change'],
  data() {
    return {
      filters: new ListFilters(this.schemaName),
      appliedFilters: [] as Filter[],
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
    /** Rows whose number, title or keyword fields contain the text. */
    searchFilters(): Filter[] {
      const text = this.search.trim();
      if (!text) {
        return [];
      }

      return this.searchFields.map((fieldname): Filter => [
        fieldname,
        'like',
        `%${text}%`,
      ]);
    },
  },
  methods: {
    onSearch(value: string) {
      this.search = value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(this.emitChange, 300);
    },
    onApply(filters: Filter[]) {
      this.appliedFilters = filters;
      this.emitChange();
    },
    removeFilter(id: number) {
      this.filters.remove(id);
      const filters = this.filters.apply();
      if (filters) this.onApply(filters);
    },
    clear() {
      window.clearTimeout(this.searchTimer);
      this.search = '';
      this.filters.clear();
      this.onApply(this.filters.apply() ?? []);
    },
    emitChange() {
      this.$emit('change', this.appliedFilters, this.searchFilters);
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
    // Pickers give `YYYY-MM-DD HH:mm:ss`; the formatter reads ISO.
    return fyo.format(String(value).replace(' ', 'T'), field);
  }

  const option = field
    ? getOptionList(field, undefined).find((option) => option.value === value)
    : undefined;
  return option?.label ?? String(value);
}
</script>
