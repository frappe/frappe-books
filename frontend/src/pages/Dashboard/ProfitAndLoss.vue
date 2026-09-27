<template>
  <div class="flex flex-col h-full">
    <SectionHeader>
      <template #title>{{ t`Profit and Loss` }}</template>
    </SectionHeader>
    <div v-if="hasData" class="mt-4 h-72 w-full">
      <FrappeBarChart
        :data="data"
        x="yearmonth"
        y="balance"
        :series-config="chartData.seriesConfig"
        :x-axis="chartData.xAxis"
        :y-axis="chartData.yAxis"
      />
    </div>
    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-ink-gray-6">
        {{ t`No transactions yet` }}
      </span>
    </div>
  </div>
</template>
<script lang="ts">
import { BarChart as FrappeBarChart } from 'frappe-ui/charts';
import { fyo } from 'src/initFyo';
import { formatXLabels, getYMax, getYMin } from 'src/utils/chart';
import { uicolors } from 'src/utils/colors';
import { getDatesAndPeriodList } from 'src/utils/misc';
import { getValueMapFromList } from 'utils';
import DashboardChartBase from './BaseDashboardChart.vue';
import SectionHeader from './SectionHeader.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ProfitAndLoss',
  components: {
    SectionHeader,
    FrappeBarChart,
  },
  extends: DashboardChartBase,
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data: () => ({
    data: [] as { yearmonth: string; balance: number }[],
    hasData: false,
  }),
  computed: {
    chartData() {
      const points = [this.data.map((d) => d.balance)];
      const positive = uicolors.blue[this.darkMode ? '600' : '500'];
      const negative = uicolors.pink[this.darkMode ? '600' : '500'];
      const format = (value: number) => fyo.format(value ?? 0, 'Currency');
      const yMax = getYMax(points);
      const yMin = getYMin(points);
      return {
        seriesConfig: {
          balance: {
            label: this.t`Profit and Loss`,
            color: positive,
            echartOptions: {
              itemStyle: {
                color: (params: { value?: [unknown, number] }) =>
                  (params.value?.[1] ?? 0) >= 0 ? positive : negative,
              },
            },
          },
        },
        xAxis: { type: 'category' as const, format: formatXLabels },
        yAxis: { min: yMin, max: yMax, format },
      };
    },
  },
  activated() {
    this.setData();
  },
  methods: {
    async setData() {
      const { fromDate, toDate, periodList } = getDatesAndPeriodList(this.period);

      const data = await fyo.db.getIncomeAndExpenses(fromDate.toISO(), toDate.toISO());
      const incomes = getValueMapFromList(data.income, 'yearmonth', 'balance');
      const expenses = getValueMapFromList(data.expense, 'yearmonth', 'balance');

      this.data = periodList.map((d) => {
        const key = d.toFormat('yyyy-MM');
        const inc = incomes[key] ?? 0;
        const exp = expenses[key] ?? 0;
        return { yearmonth: key, balance: inc - exp };
      });
      this.hasData = data.income.length > 0 || data.expense.length > 0;
    },
  },
});
</script>
