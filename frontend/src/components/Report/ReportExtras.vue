<template>
  <div
    v-if="hasExtras"
    class="flex flex-col"
    :class="phone ? 'gap-3' : 'gap-4'"
  >
    <FrappeAlert
      v-if="report.message"
      theme="blue"
      :title="t`Message from ERPNext`"
    >
      <template #description>
        <component :is="renderSafeRichText(report.message)" />
      </template>
    </FrappeAlert>

    <!-- Phones scroll the cards sideways and drop the separators. -->
    <div
      v-if="cards.length"
      class="flex gap-2"
      :class="
        phone
          ? '-mx-4 overflow-x-auto px-4 [scrollbar-width:none]'
          : 'items-stretch'
      "
    >
      <template v-for="(item, index) in visibleSummary" :key="index">
        <div
          v-if="item.type === 'separator'"
          class="flex items-center px-0.5 text-lg text-ink-gray-4"
          aria-hidden="true"
        >
          {{ item.value }}
        </div>
        <div
          v-else
          class="flex flex-col rounded-6 border border-outline-gray-1"
          :class="
            phone
              ? 'w-[150px] shrink-0 gap-1 px-3 py-2.5'
              : 'flex-1 gap-1.5 px-3.5 py-3'
          "
        >
          <span
            class="text-ink-gray-5"
            :class="phone ? 'text-sm' : 'text-[13px]'"
          >
            {{ item.label }}
          </span>
          <span
            class="font-semibold tabular-nums"
            :class="[
              getIndicatorClass(item),
              phone ? 'text-[17px]' : 'text-xl',
            ]"
            dir="ltr"
          >
            {{ formatSummaryValue(item) }}
          </span>
        </div>
      </template>
    </div>

    <div
      v-if="chart"
      class="rounded-6 border border-outline-gray-1"
      :class="phone ? 'h-40 p-3' : 'h-52 px-4 py-3.5'"
    >
      <component
        :is="chart.type === 'line' ? FrappeLineChart : FrappeBarChart"
        :data="chart.rows"
        x="label"
        :y="chart.series"
        :series-config="chart.seriesConfig"
        :palette="chart.palette"
        :x-axis="{ type: 'category' }"
        :y-axis="{ format: formatChartValue }"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { Alert as FrappeAlert } from 'frappe-ui';
import {
  BarChart as FrappeBarChart,
  LineChart as FrappeLineChart,
  type ChartPalette,
} from 'frappe-ui/charts';
import { formatCurrencyValue } from 'fyo/utils/format';
import type { Report } from 'reports/Report';
import type { SummaryItem } from 'reports/types';
import { renderSafeRichText } from 'src/utils/safeRichText';
import { computed } from 'vue';

/** What a report returns besides its rows: a message, summary cards and a chart, in that order. */
const props = defineProps<{ report: Report; phone?: boolean }>();

const INDICATOR_CLASSES: Record<string, string> = {
  green: 'text-ink-green-6',
  red: 'text-ink-red-6',
  blue: 'text-ink-blue-6',
};

const cards = computed(() =>
  props.report.summary.filter((item) => item.type !== 'separator')
);

const visibleSummary = computed(() =>
  props.phone ? cards.value : props.report.summary
);

/** Bar and line charts as ERPNext sends them; other kinds are left out. */
const chart = computed(() => {
  const source = props.report.chart;
  if (!source || !['bar', 'line'].includes(source.type ?? 'bar')) {
    return null;
  }

  const { labels, datasets } = source.data;
  const series = datasets.map((_, index) => `s${index}`);
  return {
    type: source.type,
    series,
    rows: labels.map((label, row) => ({
      label,
      ...Object.fromEntries(
        datasets.map(({ values }, index) => [series[index], values[row] ?? 0])
      ),
    })),
    seriesConfig: Object.fromEntries(
      datasets.map(({ name }, index) => [series[index], { label: name ?? '' }])
    ),
    // ERPNext's colours when they are colours the chart can draw.
    palette: (source.colors?.every((color) => color.startsWith('#'))
      ? source.colors
      : 'categorical') as ChartPalette,
  };
});

const hasExtras = computed(
  () => !!props.report.message || !!cards.value.length || !!chart.value
);

function getIndicatorClass(item: SummaryItem): string {
  return (
    INDICATOR_CLASSES[item.indicator?.toLowerCase() ?? ''] ?? 'text-ink-gray-9'
  );
}

function formatSummaryValue(item: SummaryItem): string {
  if (item.datatype === 'Currency') {
    return formatCurrencyValue(
      item.value,
      item.currency ?? '',
      props.report.fyo
    );
  }

  return props.report.fyo.format(item.value, item.datatype ?? 'Data');
}

function formatChartValue(value: number): string {
  const source = props.report.chart;
  if (source?.fieldtype === 'Currency') {
    return formatCurrencyValue(value, source.currency ?? '', props.report.fyo);
  }

  return props.report.fyo.format(value, 'Float');
}
</script>
