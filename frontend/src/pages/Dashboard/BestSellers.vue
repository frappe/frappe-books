<template>
  <div v-bind="phoneChartListeners" :class="cardClass">
    <FrappeDonutChart
      :title="t`Best sellers`"
      :subtitle="totalSales"
      :loading="!isLoaded"
      :error="error"
      :dir="isMobile ? 'ltr' : undefined"
      :data="items"
      category="item_name"
      value="amount"
      :center-label="t`Top ${items.length}`"
      :format="(value: number) => fyo.format(value, 'Currency')"
    >
      <!-- A full total overflows the hole (frappe/frappe-ui#1259); the subtitle keeps it in full. -->
      <template #center="{ label, value, percent }">
        <div
          class="truncate text-center text-xl font-semibold tabular-nums text-ink-gray-8"
        >
          {{ compactCurrency(value) }}
        </div>
        <div
          class="flex items-baseline justify-center gap-1 text-xs text-ink-gray-5"
        >
          <span class="min-w-0 truncate">{{ label }}</span>
          <span v-if="percent !== undefined" class="shrink-0">
            {{ percent < 1 ? '<1%' : `${Math.round(percent)}%` }}
          </span>
        </div>
      </template>
      <template #empty>
        <span class="text-p-sm text-ink-gray-5">
          {{ t`No sales in this period` }}
        </span>
      </template>
      <template #error>
        <ChartLoadError @retry="loadData" />
      </template>
    </FrappeDonutChart>
  </div>
</template>

<script lang="ts">
import { DonutChart as FrappeDonutChart } from 'frappe-ui/charts';
import { getBestSellers, type BestSeller } from 'src/utils/dashboard';
import { defineComponent } from 'vue';
import DashboardChartBase from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';

export default defineComponent({
  name: 'BestSellers',
  components: {
    ChartLoadError,
    FrappeDonutChart,
  },
  extends: DashboardChartBase,
  data: () => ({
    items: [] as BestSeller[],
    total: 0,
  }),
  computed: {
    totalSales(): string | undefined {
      if (!this.items.length) {
        return;
      }

      return this.t`Total sales: ${this.fyo.format(this.total, 'Currency')}`;
    },
  },
  methods: {
    async setData() {
      const { items, total } = await getBestSellers(this.period);
      this.items = items;
      this.total = total;
    },
  },
});
</script>
