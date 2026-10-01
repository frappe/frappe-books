<template>
  <div class="flex flex-col h-full">
    <SectionHeader>
      <template #title>{{ t`Profit and Loss` }}</template>
      <template v-if="isMobile" #action>
        <div class="flex gap-3 text-xs text-ink-gray-6">
          <span
            v-for="entry in legend"
            :key="entry.label"
            class="flex items-center gap-1.5"
          >
            <span
              class="size-2 rounded-[2px]"
              :style="{ backgroundColor: entry.color }"
            />
            {{ entry.label }}
          </span>
        </div>
      </template>
    </SectionHeader>
    <MobileSectionState
      v-if="showLoadState"
      class="mt-4 h-[184px]"
      :has-failed="hasFailed"
      @retry="loadData"
    />
    <div
      v-else-if="hasData"
      v-bind="phoneChartListeners"
      class="mt-4 w-full"
      :class="isMobile ? 'h-[184px]' : 'h-72'"
    >
      <FrappeBarChart
        :dir="isMobile ? 'ltr' : undefined"
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
import { getDashboardData, MonthlyBalance } from 'src/utils/dashboard';
import DashboardChartBase from './BaseDashboardChart.vue';
import MobileSectionState from './MobileSectionState.vue';
import SectionHeader from './SectionHeader.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ProfitAndLoss',
  components: {
    SectionHeader,
    FrappeBarChart,
    MobileSectionState,
  },
  extends: DashboardChartBase,
  data: () => ({
    data: [] as MonthlyBalance[],
    hasData: false,
  }),
  computed: {
    colors() {
      return {
        positive: uicolors.blue[this.darkMode ? '600' : '500'],
        negative: uicolors.pink[this.darkMode ? '600' : '500'],
      };
    },
    legend() {
      return [
        { label: this.t`Profit`, color: this.colors.positive },
        { label: this.t`Loss`, color: this.colors.negative },
      ];
    },
    chartData() {
      const points = [this.data.map((d) => d.balance)];
      const { positive, negative } = this.colors;
      const format = (value: number) => fyo.format(value ?? 0, 'Currency');
      const yMax = getYMax(points);
      const yMin = getYMin(points);
      const phoneAxes = this.isMobile ? this.phoneAxisLabels : undefined;
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
        xAxis: {
          type: 'category' as const,
          format: formatXLabels,
          echartOptions: phoneAxes?.x,
        },
        yAxis: { min: yMin, max: yMax, format, echartOptions: phoneAxes?.y },
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
