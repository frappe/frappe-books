<template>
  <div
    class="flex flex-col"
    :class="isScrollable ? 'min-h-0 flex-1' : 'min-h-full pb-12'"
  >
    <div
      class="flex shrink-0 gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]"
    >
      <button
        v-if="columnOptions.length > 1"
        type="button"
        :class="chipClass"
        @click="columnSheetOpen = true"
      >
        <span class="text-ink-gray-5">{{ t`Column` }}</span>
        {{ valueColumns[0]?.label }}
        <FrappeIcon
          icon="lucide-chevron-down"
          class="size-3.5 text-ink-gray-5"
        />
      </button>
      <button
        v-for="chip in filters.chips"
        :key="chip.fieldname"
        type="button"
        :class="chipClass"
        @click="emit('open-filters')"
      >
        <span class="text-ink-gray-5">{{ chip.label }}</span>
        {{ chip.value }}
      </button>
    </div>

    <MobileReportSkeleton v-if="loading" v-bind="skeleton" />
    <div
      v-else-if="isEmpty"
      class="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-28 pt-8"
    >
      <img src="../../../assets/img/list-empty-state.svg" alt="" class="w-24" />
      <p class="text-base text-ink-gray-8">{{ t`No entries found` }}</p>
      <FrappeButton
        v-if="filters.hasChanges"
        size="lg"
        :label="t`Clear filters`"
        @click="emit('clear-filters')"
      />
    </div>
    <MobileReportTree
      v-else-if="tree"
      :rows="treeRows"
      :values="valueColumns"
      :label-header="report.columns[tree.headerIndex]?.label ?? ''"
      :grouped="!!tree.layout.groupBy"
      :icon="tree.layout.icon"
      :scroll="isScrollable"
      @open="openDetail"
    />
    <MobileReportEntries
      v-else-if="entries"
      :entries="entries"
      @open="openDetail"
    />

    <MobileReportDetail
      v-model:open="detailOpen"
      :report="report"
      :row="detailRow"
      :title="detailTitle"
    />
    <MobileOptionsSheet
      v-model:open="columnSheetOpen"
      :title="t`Column`"
      :options="columnOptions.map(({ key, label }) => ({ value: key, label }))"
      :value="valueColumns[0]?.key ?? ''"
      @select="(key) => chooseColumn(String(key))"
    />
  </div>
</template>
<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core';
import { Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import type { Report } from 'reports/Report';
import type { ReportRow } from 'reports/types';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { computed, ref } from 'vue';
import { MobileEntries } from './MobileEntries';
import { MobileFilters, type FilterValues } from './MobileFilters';
import MobileReportDetail from './MobileReportDetail.vue';
import MobileReportEntries from './MobileReportEntries.vue';
import MobileReportSkeleton from './MobileReportSkeleton.vue';
import MobileReportTree from './MobileReportTree.vue';
import { MobileTree } from './MobileTree';
import { getColumnIndex, getPhoneLayout } from './mobileRows';

const props = defineProps<{
  report: Report;
  defaults: FilterValues;
  loading: boolean;
}>();
const emit = defineEmits<{ 'open-filters': []; 'clear-filters': [] }>();

const chipClass =
  'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8 active:bg-surface-gray-4';

const columnChoices = useLocalStorage<Record<string, string>>(
  'books:report-phone-columns',
  {}
);
const columnSheetOpen = ref(false);
const detailOpen = ref(false);
const detailRow = ref<ReportRow | null>(null);

const layout = computed(() => getPhoneLayout(props.report));
const tree = computed(() =>
  layout.value.type === 'tree'
    ? new MobileTree(props.report, layout.value)
    : null
);
const entries = computed(() =>
  layout.value.type === 'entries'
    ? new MobileEntries(props.report, layout.value)
    : null
);
const filters = computed(
  () => new MobileFilters(props.report, props.defaults, layout.value.chips)
);

const columnOptions = computed(() => tree.value?.columnOptions ?? []);
const valueColumns = computed(
  () =>
    tree.value?.getValueColumns(columnChoices.value[props.report.reportName]) ??
    []
);
const treeRows = computed(() => tree.value?.getRows(valueColumns.value) ?? []);
const isScrollable = computed(() => !!tree.value?.layout.scroll);
const isEmpty = computed(
  () => !props.report.reportData.some((row) => !row.isEmpty)
);
const skeleton = computed(() => {
  if (!tree.value) {
    return { values: [104], height: 68, lines: 2 as const };
  }

  const values = valueColumns.value.map(({ width }) => width);
  const height = tree.value.layout.groupBy ? 60 : 48;
  return { values, height, lines: 1 as const };
});

const detailTitle = computed(() => {
  const index = tree.value
    ? tree.value.headerIndex
    : getColumnIndex(props.report, entries.value?.layout.title ?? '');
  return detailRow.value?.cells[index]?.value ?? '';
});

function openDetail(row: ReportRow) {
  detailRow.value = row;
  detailOpen.value = true;
}

function chooseColumn(key: string) {
  columnChoices.value = {
    ...columnChoices.value,
    [props.report.reportName]: key,
  };
}
</script>
