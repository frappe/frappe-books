<template>
  <div>
    <!-- Title and Period Selector -->
    <div class="flex items-center justify-between">
      <div class="font-semibold text-base text-ink-gray-9">
        {{ t`Cashflow` }}
      </div>
    </div>

    <!-- Line Chart -->
    <div
      v-if="chartData.data.length"
      v-bind="phoneChartListeners"
      class="mt-4 w-full"
      :class="isMobile ? 'h-[208px]' : 'h-56'"
    >
      <FrappeLineChart
        :dir="isMobile ? 'ltr' : undefined"
        :data="chartData.data"
        x="yearmonth"
        :y="['inflow', 'outflow']"
        :palette="chartData.colors"
        :series-config="chartData.seriesConfig"
        :x-axis="chartData.xAxis"
        :y-axis="chartData.yAxis"
      />
    </div>
  </div>
</template>
<script lang="ts">
import { LineChart as FrappeLineChart } from 'frappe-ui/charts';
import { fyo } from 'src/initFyo';
import { formatXLabels, getYMax } from 'src/utils/chart';
import { uicolors } from 'src/utils/colors';
import { getDashboardData, MonthlyCashflow } from 'src/utils/dashboard';
import DashboardChartBase from './BaseDashboardChart.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Cashflow',
  components: {
    FrappeLineChart,
  },
  extends: DashboardChartBase,
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data: () => ({
    data: [] as MonthlyCashflow[],
    hasData: false,
  }),
  computed: {
    chartData() {
      let data = this.data;
      let colors = [
        uicolors.blue[this.darkMode ? '600' : '500'],
        uicolors.pink[this.darkMode ? '600' : '500'],
      ];
      if (!this.hasData) {
        data = dummyData;
        colors = [
          this.darkMode ? uicolors.gray['700'] : uicolors.gray['200'],
          this.darkMode ? uicolors.gray['800'] : uicolors.gray['100'],
        ];
      }

      const points = (['inflow', 'outflow'] as const).map((k) => data.map((d) => d[k]));

      const format = (value: number) => fyo.format(value ?? 0, 'Currency');
      const yMax = getYMax(points);
      const phoneAxes = this.isMobile ? this.phoneAxisLabels : undefined;
      return {
        data,
        colors,
        seriesConfig: {
          inflow: { label: this.t`Inflow`, color: colors[0], smooth: true },
          outflow: { label: this.t`Outflow`, color: colors[1], smooth: true },
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
  async activated() {
    await this.setData();
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

const dummyData = [
  {
    inflow: 100,
    outflow: 250,
    yearmonth: '2021-05',
  },
  {
    inflow: 350,
    outflow: 100,
    yearmonth: '2021-06',
  },
  {
    inflow: 50,
    outflow: 300,
    yearmonth: '2021-07',
  },
  {
    inflow: 320,
    outflow: 100,
    yearmonth: '2021-08',
  },
];
</script>
