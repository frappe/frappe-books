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
        <!-- The dashboard's number card, in ERPNext's indicator colour; it fills its box. -->
        <div v-else :class="phone ? 'w-40 shrink-0' : 'min-w-0 flex-1'">
          <FrappeNumberCard
            class="h-full"
            :title="item.label ?? ''"
            :value="toCardValue(item.value)"
            :format="(value: number) => formatSummaryValue(item, value)"
            :color="getIndicatorColor(item)"
          />
        </div>
      </template>
    </div>

    <!-- Framed by frappe-ui's chart card, as the number cards are; as tall as the dashboard's Cashflow on desktop. -->
    <FrappeChartCard v-if="chart" :class="phone ? 'h-40' : 'h-72'">
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
    </FrappeChartCard>
  </div>
</template>
<script setup lang="ts">
import { Alert as FrappeAlert } from 'frappe-ui';
import {
  BarChart as FrappeBarChart,
  ChartCard as FrappeChartCard,
  LineChart as FrappeLineChart,
  NumberCard as FrappeNumberCard,
  type ChartPalette,
} from 'frappe-ui/charts';
import { DEFAULT_LOCALE } from 'fyo/utils/consts';
import { formatCurrencyValue } from 'fyo/utils/format';
import type { Report } from 'reports/Report';
import type { SummaryItem } from 'reports/types';
import { getCompactCurrencyFormat } from 'src/utils/chart';
import { renderSafeRichText } from 'src/utils/safeRichText';
import { computed } from 'vue';

/** What a report returns besides its rows: a message, summary cards and a chart, in that order. */
const props = defineProps<{ report: Report; phone?: boolean }>();

const INDICATOR_COLORS: Record<string, string> = {
  green: 'var(--ink-green-6)',
  red: 'var(--ink-red-6)',
  blue: 'var(--ink-blue-6)',
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

function getIndicatorColor(item: SummaryItem): string | undefined {
  return INDICATOR_COLORS[item.indicator?.toLowerCase() ?? ''];
}

function toCardValue(value: unknown): number | null {
  const number = Number(value);
  return value === null || value === '' || Number.isNaN(number) ? null : number;
}

/** Phones print amounts compactly, as the dashboard's cards do. */
function formatSummaryValue(item: SummaryItem, value: number): string {
  const { fyo } = props.report;
  if (item.datatype === 'Currency' && props.phone) {
    const locale = fyo.singles.SystemSettings?.locale ?? DEFAULT_LOCALE;
    const symbol = fyo.currencySymbols[item.currency ?? ''];
    return getCompactCurrencyFormat(String(locale), symbol)(value);
  }

  if (item.datatype === 'Currency') {
    return formatCurrencyValue(value, item.currency ?? '', fyo);
  }

  return props.report.fyo.format(value, item.datatype ?? 'Data');
}

function formatChartValue(value: number): string {
  const source = props.report.chart;
  if (source?.fieldtype === 'Currency') {
    return formatCurrencyValue(value, source.currency ?? '', props.report.fyo);
  }

  return props.report.fyo.format(value, 'Float');
}
</script>
