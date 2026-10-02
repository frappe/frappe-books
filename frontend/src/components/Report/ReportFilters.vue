<template>
  <div
    role="group"
    :aria-label="t`Filters`"
    class="flex flex-wrap items-center gap-2 px-3 pb-3 pt-5 sm:px-5"
  >
    <template v-for="item in items" :key="item.key">
      <FrappeDateRangePicker
        v-if="item.type === 'dateRange'"
        class="w-64"
        size="sm"
        variant="outline"
        dual-pane
        :model-value="dateRange"
        :placeholder="t`Date Range`"
        :required="item.from.required || item.to.required"
        :format="getDatePickerFormat()"
        :disabled="loading"
        @update:model-value="setDateRange"
      >
        <template #prefix>
          <span
            class="lucide-calendar-range size-4 text-ink-gray-5"
            aria-hidden="true"
          />
        </template>
        <template #actions="{ setRange, close }">
          <FrappeItemListRow
            v-for="preset in getPresets()"
            :key="preset.label"
            as="button"
            type="button"
            class="text-start hover:bg-surface-gray-2"
            @click="
              setRange(preset.range);
              close();
            "
          >
            {{ preset.label }}
          </FrappeItemListRow>
        </template>
      </FrappeDateRangePicker>
      <FrappeTabButtons
        v-else-if="item.type === 'tabs'"
        :aria-label="item.field.label"
        :options="item.field.options"
        :model-value="getTabValue(item.field)"
        @update:model-value="(value) => setFilter(item.field, value)"
      />
      <FormControl
        v-else
        :class="getWidthClass(item.field)"
        :border="true"
        size="small"
        :df="item.field"
        :show-label="item.field.fieldtype === 'Check'"
        :inline-label="item.field.fieldtype === 'Select'"
        :layout="item.field.fieldtype === 'Check' ? 'inline' : undefined"
        :value="report.get(item.field.fieldname)"
        :read-only="loading"
        @change="(value: DocValue) => setFilter(item.field, value)"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
import {
  DateRangePicker as FrappeDateRangePicker,
  ItemListRow as FrappeItemListRow,
  TabButtons as FrappeTabButtons,
  type DateRangeValue,
} from 'frappe-ui';
import type { DocValue } from 'fyo/core/types';
import { DateTime } from 'luxon';
import type { Report } from 'reports/Report';
import type { Field } from 'schemas/types';
import { getDatePickerFormat } from 'src/components/Controls/datePickerFormat';
import FormControl from 'src/components/Controls/FormControl.vue';
import { fyo } from 'src/initFyo';
import { computed } from 'vue';
import { getDateRangePresets, getFilterItems } from './filterToolbar';

const props = defineProps<{ report: Report; loading: boolean }>();

const items = computed(() => getFilterItems(props.report.filters));

const dateRange = computed<DateRangeValue>(() => {
  const from = props.report.get('fromDate');
  const to = props.report.get('toDate');
  return typeof from === 'string' && typeof to === 'string' ? [from, to] : [];
});

/** Read on each open, so they follow today and the fiscal year settings. */
function getPresets() {
  const settings = fyo.singles.AccountingSettings;
  return getDateRangePresets({
    start: settings?.fiscal_year_start,
    end: settings?.fiscal_year_end,
  });
}

function getWidthClass(field: Field): string {
  return ['Select', 'Check'].includes(field.fieldtype) ? '' : 'w-40';
}

function getTabValue(field: Field): string | undefined {
  const value = props.report.get(field.fieldname);
  return typeof value === 'string' ? value : undefined;
}

async function setFilter(field: Field, value: DocValue) {
  await props.report.set(field.fieldname, value);
}

/** Both dates change together, so the report runs once. */
async function setDateRange([from, to]: DateRangeValue) {
  await props.report.setFilters({
    fromDate: toLocalDate(from),
    toDate: toLocalDate(to),
  });
  await props.report.updateData();
}

function toLocalDate(value?: string): Date | null {
  return value ? DateTime.fromISO(value).toJSDate() : null;
}
</script>
