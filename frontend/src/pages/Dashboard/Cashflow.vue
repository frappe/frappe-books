<template>
  <div>
    <!-- Title and Period Selector -->
    <div class="flex items-center justify-between">
      <div class="font-semibold text-base text-ink-gray-9">
        {{ t`Cashflow` }}
      </div>
    </div>

    <!-- Line Chart -->
    <div v-if="chartData.data.length" class="mt-4 h-56 w-full">
      <FrappeLineChart
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
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { LineChart as FrappeLineChart } from 'frappe-ui/charts';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { formatXLabels, getYMax } from 'src/utils/chart';
import { uicolors } from 'src/utils/colors';
import { getDatesAndPeriodList } from 'src/utils/misc';
import DashboardChartBase from './BaseDashboardChart.vue';
import { defineComponent } from 'vue';
import { getMapFromList } from 'utils/index';
import { PeriodKey } from 'src/utils/types';

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
    data: [] as { inflow: number; outflow: number; yearmonth: string }[],
    periodList: [],
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
      return {
        data,
        colors,
        seriesConfig: {
          inflow: { label: this.t`Inflow`, color: colors[0], smooth: true },
          outflow: { label: this.t`Outflow`, color: colors[1], smooth: true },
        },
        xAxis: { type: 'category' as const, format: formatXLabels },
        yAxis: { max: yMax, format },
      };
    },
  },
  async activated() {
    await this.setData();
    if (!this.hasData) {
      await this.setHasData();
    }
  },
  methods: {
    async setData() {
      const { periodList, fromDate, toDate } = getDatesAndPeriodList(this.period as PeriodKey);

      const data = await fyo.db.getCashflow(fromDate.toISO(), toDate.toISO());
      const dataMap = getMapFromList(data, 'yearmonth');
      this.data = periodList.map((p) => {
        const key = p.toFormat('yyyy-MM');
        const item = dataMap[key];
        if (item) {
          return item;
        }

        return {
          inflow: 0,
          outflow: 0,
          yearmonth: key,
        };
      });
    },
    async setHasData() {
      const accounts = await fyo.db.getAllRaw('Account', {
        filters: {
          accountType: ['in', [AccountTypeEnum.Cash, AccountTypeEnum.Bank]],
        },
      });
      const accountNames = accounts.map((a) => a.name as string);
      const count = await fyo.db.count(ModelNameEnum.AccountingLedgerEntry, {
        filters: { account: ['in', accountNames] },
      });
      this.hasData = count > 0;
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
