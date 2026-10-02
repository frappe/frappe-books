<template>
  <div v-bind="phoneChartListeners" :class="cardClass">
    <FrappeDonutChart
      :title="t`Top Expenses`"
      :loading="!isLoaded"
      :error="error"
      :dir="isMobile ? 'ltr' : undefined"
      :data="expenses"
      category="account"
      value="total"
      :center-label="t`Total Spending`"
      :format="(value: number) => fyo.format(value, 'Currency')"
    >
      <!-- A full total overflows the hole (frappe/frappe-ui#1259); the tooltip keeps it in full. -->
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
          {{ t`No expenses in this period` }}
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
import { getDashboardData } from 'src/utils/dashboard';
import { defineComponent } from 'vue';
import DashboardChartBase from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';

export default defineComponent({
  name: 'Expenses',
  components: {
    ChartLoadError,
    FrappeDonutChart,
  },
  extends: DashboardChartBase,
  data: () => ({
    expenses: [] as { account: string; total: number }[],
  }),
  methods: {
    async setData() {
      this.expenses = await getDashboardData<
        { account: string; total: number }[]
      >('get_top_expenses', this.period);
    },
  },
});
</script>
