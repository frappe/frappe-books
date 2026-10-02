<template>
  <div v-bind="phoneChartListeners" :class="cardClass">
    <FrappeLineChart
      :title="t`Cashflow`"
      :loading="!isLoaded"
      :error="error"
      :dir="isMobile ? 'ltr' : undefined"
      :data="hasData ? data : []"
      x="yearmonth"
      :y="['inflow', 'outflow']"
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
    </FrappeLineChart>
  </div>
</template>
<script lang="ts">
import { LineChart as FrappeLineChart } from 'frappe-ui/charts';
import { fyo } from 'src/initFyo';
import { formatXLabels, getYMax } from 'src/utils/chart';
import { getDashboardData, MonthlyCashflow } from 'src/utils/dashboard';
import DashboardChartBase from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Cashflow',
  components: {
    ChartLoadError,
    FrappeLineChart,
  },
  extends: DashboardChartBase,
  data: () => ({
    data: [] as MonthlyCashflow[],
    hasData: false,
  }),
  computed: {
    chartData() {
      const points = (['inflow', 'outflow'] as const).map((k) =>
        this.data.map((d) => d[k])
      );

      const format = (value: number) => fyo.format(value ?? 0, 'Currency');
      const yMax = getYMax(points);
      const phoneAxes = this.isMobile ? this.phoneAxisLabels : undefined;
      return {
        seriesConfig: {
          inflow: { label: this.t`Inflow`, smooth: true },
          outflow: { label: this.t`Outflow`, smooth: true },
        },
        xAxis: {
          type: 'category' as const,
          format: formatXLabels,
          echartOptions: phoneAxes?.x,
        },
        yAxis: { max: yMax, format, echartOptions: phoneAxes?.y },
      };
    },
  },
  methods: {
    async setData() {
      const { months, has_data } = await getDashboardData<{
        months: MonthlyCashflow[];
        has_data: boolean;
      }>('get_cashflow', this.period);
      this.data = months;
      this.hasData = has_data;
    },
  },
});
</script>
