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
        :class="{
          '[&_[data-slot=control]]:border-outline-red-3': isMissing(item),
        }"
        :model-value="getDateRange(item)"
        :placeholder="t`Date range`"
        :required="isRequired(item)"
        :format="getRangeFormat()"
        :disabled="loading"
        @update:model-value="(range) => setDateRange(item, range)"
      >
        <template #prefix>
          <span
            class="lucide-calendar-range size-4 text-ink-gray-5"
            aria-hidden="true"
          />
        </template>
        <template
          v-if="report.marksRequired && isRequired(item)"
          #suffix="{ open, setOpen }"
        >
          <span class="text-base text-ink-red-5" aria-hidden="true">*</span>
          <span
            data-slot="chevron"
            class="lucide-chevron-down size-4 cursor-pointer"
            @mousedown.prevent="setOpen(!open)"
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
      <!-- A set value keeps its label beside it, as phone chips do. -->
      <FormControl
        v-else
        :class="getWidthClass(item.field)"
        :border="true"
        size="small"
        :df="item.field"
        :show-label="item.field.fieldtype === 'Check'"
        :inline-label="item.field.fieldtype !== 'Check'"
        :trigger-button="isLinkField(item.field) || undefined"
        :required-mark="report.marksRequired"
        :placeholder="t`All`"
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
import { isNumeric } from 'src/utils';
import { computed } from 'vue';
import {
  getDateRangePresets,
  getFilterItems,
  type FilterItem,
} from './filterToolbar';

const props = defineProps<{ report: Report; loading: boolean }>();

type DateRangeItem = Extract<FilterItem, { type: 'dateRange' }>;

const items = computed(() =>
  getFilterItems(props.report.filters, props.report.tabFilters)
);

function getDateRange({ from, to }: DateRangeItem): DateRangeValue {
  const fromDate = props.report.get(from.fieldname);
  const toDate = props.report.get(to.fieldname);
  return typeof fromDate === 'string' && typeof toDate === 'string'
    ? [fromDate, toDate]
    : [];
}

function isRequired({ from, to }: DateRangeItem): boolean {
  return !!(from.required || to.required);
}

/** A required range left empty, which keeps the report from running. */
function isMissing(item: DateRangeItem): boolean {
  return isRequired(item) && !getDateRange(item).length;
}

/** Read on each open, so they follow today and the report's fiscal year. */
function getPresets() {
  return getDateRangePresets(props.report.getFiscalYear());
}

/** frappe-ui reads the range back from its text, split at commas, on close. */
function getRangeFormat() {
  return getDatePickerFormat().replace(/,/g, '');
}

/** Link filters open from a pill, as Selects do, so they size to their value. */
function isLinkField(field: Field): boolean {
  return ['Link', 'DynamicLink', 'AutoComplete'].includes(field.fieldtype);
}

function getWidthClass(field: Field): string {
  const isPill =
    ['Select', 'Check'].includes(field.fieldtype) ||
    isLinkField(field) ||
    field.control === 'MultiSelectList';
  if (isPill) {
    return '';
  }

  return isNumeric(field) ? 'w-44' : 'w-56';
}

function getTabValue(field: Field): string | undefined {
  const value = props.report.get(field.fieldname);
  return typeof value === 'string' ? value : undefined;
}

async function setFilter(field: Field, value: DocValue) {
  await props.report.set(field.fieldname, value);
}

/**
 * Both dates change in one tick, so the picker never shows half a range,
 * and the report runs once.
 */
async function setDateRange(item: DateRangeItem, [from, to]: DateRangeValue) {
  await Promise.all([
    props.report.set(item.from.fieldname, toLocalDate(from), false),
    props.report.set(item.to.fieldname, toLocalDate(to), false),
  ]);
  await props.report.updateData();
}

function toLocalDate(value?: string): Date | null {
  return value ? DateTime.fromISO(value).toJSDate() : null;
}
</script>
