<template>
  <div v-bind="phoneChartListeners" :class="cardClass">
    <FrappeBarChart
      :title="t`Profit and Loss`"
      :loading="!isLoaded"
      :error="error"
      :dir="isMobile ? 'ltr' : undefined"
      :data="hasData ? chartData.rows : []"
      x="yearmonth"
      :y="['profit', 'loss']"
      stacked
      palette="diverging"
      :series-config="chartData.seriesConfig"
      :x-axis="chartData.xAxis"
      :y-axis="chartData.yAxis"
    >
      <template #empty>
        <span class="text-p-sm text-ink-gray-5">
          {{ t`No transactions in this period` }}
        </span>
      </template>
      <template #error>
        <ChartLoadError @retry="loadData" />
      </template>
    </FrappeBarChart>
  </div>
</template>
<script lang="ts">
import { BarChart as FrappeBarChart } from 'frappe-ui/charts';
import { fyo } from 'src/initFyo';
import { formatXLabels, getYMax, getYMin } from 'src/utils/chart';
import { getDashboardData, MonthlyBalance } from 'src/utils/dashboard';
import DashboardChartBase from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ProfitAndLoss',
  components: {
    ChartLoadError,
    FrappeBarChart,
  },
  extends: DashboardChartBase,
  data: () => ({
    data: [] as MonthlyBalance[],
    hasData: false,
  }),
  computed: {
    chartData() {
      const points = [this.data.map((d) => d.balance)];
      const format = (value: number) => fyo.format(value ?? 0, 'Currency');
      const phoneAxes = this.isMobile ? this.phoneAxisLabels : undefined;
      return {
        // A month is a profit or a loss, so it fills one of the two series.
        rows: this.data.map(({ yearmonth, balance }) =>
          balance < 0
            ? { yearmonth, loss: balance }
            : { yearmonth, profit: balance }
        ),
        seriesConfig: {
          profit: { label: this.t`Profit` },
          loss: { label: this.t`Loss` },
        },
        xAxis: {
          type: 'category' as const,
          format: formatXLabels,
          echartOptions: phoneAxes?.x,
        },
        yAxis: {
          min: getYMin(points),
          max: getYMax(points),
          format,
          echartOptions: phoneAxes?.y,
        },
      };
    },
  },
  methods: {
    async setData() {
      const { months, has_data } = await getDashboardData<{
        months: MonthlyBalance[];
        has_data: boolean;
      }>('get_profit_and_loss', this.period);
      this.data = months;
      this.hasData = has_data;
    },
  },
});
</script>
