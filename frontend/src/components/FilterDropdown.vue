<template>
  <FrappePopover
    v-if="filters.fields.length"
    side="bottom"
    align="end"
    :offset="8"
    :open="isOpen"
    @update:open="onOpenChange"
  >
    <template #trigger>
      <FrappeButton icon-left="lucide-list-filter">
        {{ activeFilterCount > 0 ? filterAppliedMessage : t`Filter` }}
      </FrappeButton>
    </template>
    <section
      :aria-label="t`Filters`"
      class="flex max-h-[var(--reka-popover-content-available-height)] w-[40rem] max-w-[calc(100vw-1.5rem)] flex-col"
    >
      <h2
        class="shrink-0 px-4 pb-3 pt-4 text-base-semibold text-ink-gray-8"
      >
        {{ t`Filters` }}
      </h2>
      <div class="min-h-0 overflow-y-auto px-4 pb-4">
        <div v-if="filters.explicitRows.length" class="flex flex-col gap-4">
          <div
            v-for="(filter, i) in filters.explicitRows"
            :key="filter.id"
            role="group"
            :aria-label="t`Filter ${i + 1}`"
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_2rem]"
          >
            <Select
              :border="true"
              :show-label="true"
              class="min-w-0"
              :df="{
                label: t`Field`,
                fieldname: 'fieldname',
                fieldtype: 'Select',
                options: filters.fieldOptions,
              }"
              :value="filter.fieldname"
              @change="(value) => filters.update(filter, 'fieldname', value)"
            />
            <Select
              :border="true"
              :show-label="true"
              class="min-w-0"
              :df="{
                label: t`Condition`,
                fieldname: 'condition',
                fieldtype: 'Select',
                options: filters.conditionsFor(filter),
              }"
              :value="filter.condition"
              @change="(value) => filters.update(filter, 'condition', value)"
            />
            <div
              v-if="isValuelessCondition(filter.condition)"
              class="col-span-2 h-8 sm:col-span-1"
            />
            <FilterValueInput
              v-else
              :key="filter.fieldname"
              class="col-span-2 min-w-0 sm:col-span-1"
              :field="filters.fieldFor(filter)"
              :condition="filter.condition"
              :value="filter.value"
              :filters="filters.filterSet.rows"
              @change="
                (value: FilterValue) => filters.update(filter, 'value', value)
              "
              @apply="applyFilters"
            />
            <FrappeButton
              icon="lucide-x"
              size="xs"
              variant="ghost"
              class="col-start-3 row-start-1 mb-1 justify-self-center sm:col-start-4"
              :tooltip="t`Remove filter`"
              :aria-label="t`Remove filter ${i + 1}`"
              @click="filters.remove(filter.id)"
            />
          </div>
        </div>
        <p v-else class="py-2 text-base text-ink-gray-6">
          {{ t`No filters selected` }}
        </p>
      </div>
      <FrappeErrorMessage class="px-4 pb-3" :message="filters.error" />
      <footer
        class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-outline-gray-1 p-3"
      >
        <FrappeButton
          icon-left="lucide-plus"
          size="md"
          variant="ghost"
          @click="filters.add()"
        >
          {{ t`Add a filter` }}
        </FrappeButton>
        <div v-if="filters.explicitRows.length" class="flex items-center gap-2">
          <FrappeButton size="md" variant="ghost" @click="clearAllFilters">
            {{ t`Clear` }}
          </FrappeButton>
          <FrappeButton size="md" variant="solid" @click="applyFilters">
            {{ t`Apply` }}
          </FrappeButton>
        </div>
      </footer>
    </section>
  </FrappePopover>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  ErrorMessage as FrappeErrorMessage,
  Popover as FrappePopover,
} from 'frappe-ui';
import { defineComponent } from 'vue';
import Select from './Controls/Select.vue';
import FilterValueInput from './FilterValueInput.vue';
import { t } from 'fyo';
import {
  isValuelessCondition,
  type FilterCondition,
  type FilterValue,
} from 'src/utils/filterQuery';
import { ListFilters } from 'src/utils/listFilters';

export default defineComponent({
  name: 'FilterDropdown',
  components: {
    FrappeErrorMessage,
    FrappePopover,
    FilterValueInput,
    Select,
    FrappeButton,
  },
  props: { schemaName: { type: String, required: true } },
  emits: ['change'],
  data() {
    return {
      filters: new ListFilters(this.schemaName),
      isOpen: false,
    };
  },
  computed: {
    activeFilterCount(): number {
      return this.filters.applied.length;
    },
    filterAppliedMessage(): string {
      return this.activeFilterCount === 1
        ? t`1 filter applied`
        : t`${this.activeFilterCount} filters applied`;
    },
  },
  watch: {
    schemaName(schemaName: string) {
      this.filters = new ListFilters(schemaName);
      this.isOpen = false;
      this.$emit('change', []);
    },
  },
  methods: {
    isValuelessCondition,
    async onOpenChange(open: boolean) {
      if (open) this.isOpen = true;
      else {
        // Outside pointerdown runs before blur commits the picker's input.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        this.applyFilters();
      }
    },
    addFilter(
      fieldname: string,
      condition: FilterCondition,
      value: FilterValue,
      implicit = false
    ) {
      this.filters.filterSet.add(fieldname, condition, value, implicit);
    },
    clearAllFilters() {
      this.filters.clear();
      this.emitFilterChange();
    },
    applyFilters() {
      if (this.emitFilterChange()) this.isOpen = false;
    },
    emitFilterChange(): boolean {
      const filters = this.filters.apply();
      if (filters) this.$emit('change', filters);
      return filters !== undefined;
    },
  },
});
</script>
