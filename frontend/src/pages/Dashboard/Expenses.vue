<template>
  <div class="flex flex-col h-full">
    <SectionHeader>
      <template #title>{{ t`Top Expenses` }}</template>
    </SectionHeader>

    <MobileSectionState
      v-if="showLoadState"
      class="mt-4 h-32"
      :has-failed="hasFailed"
      @retry="loadData"
    />
    <MobileExpenses
      v-else-if="isMobile && hasData"
      class="mt-4"
      :expenses="expenses"
      :total="totalExpense"
      :dark-mode="darkMode"
    />
    <div v-else-if="hasData" class="h-64 w-full">
      <FrappeDonutChart
        :data="expenses"
        category="account"
        value="total"
        :center-label="t`Total Spending`"
        :format="(value: number) => fyo.format(value, 'Currency')"
        :palette="expensePalette"
      />
    </div>

    <!-- Empty Message -->
    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-ink-gray-6">
        {{ t`No expenses in this period` }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { DonutChart as FrappeDonutChart } from 'frappe-ui/charts';
import { uicolors } from 'src/utils/colors';
import { getDashboardData } from 'src/utils/dashboard';
import { defineComponent } from 'vue';
import DashboardChartBase from './BaseDashboardChart.vue';
import MobileExpenses from './MobileExpenses.vue';
import MobileSectionState from './MobileSectionState.vue';
import SectionHeader from './SectionHeader.vue';

export default defineComponent({
  name: 'Expenses',
  components: {
    FrappeDonutChart,
    MobileExpenses,
    MobileSectionState,
    SectionHeader,
  },
  extends: DashboardChartBase,
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data: () => ({
    expenses: [] as {
      account: string;
      total: number;
      color: { color: string; darkColor: string };
      class: { class: string; darkClass: string };
    }[],
  }),
  computed: {
    totalExpense(): number {
      return this.expenses.reduce((sum, expense) => sum + expense.total, 0);
    },
    hasData(): boolean {
      return this.expenses.length > 0;
    },
    expensePalette(): string[] {
      return this.expenses.map(({ color }) => (this.darkMode ? color.darkColor : color.color));
    },
  },
  methods: {
    async setData() {
      const topExpenses = await getDashboardData<
        { account: string; total: number }[]
      >('get_top_expenses', this.period);
      const shades = [
        { class: 'bg-pink-500', hex: uicolors.pink['500'] },
        { class: 'bg-pink-400', hex: uicolors.pink['400'] },
        { class: 'bg-pink-300', hex: uicolors.pink['300'] },
        { class: 'bg-pink-200', hex: uicolors.pink['200'] },
        { class: 'bg-pink-100', hex: uicolors.pink['100'] },
      ];

      const darkshades = [
        { class: 'bg-pink-600', hex: uicolors.pink['600'] },
        { class: 'bg-pink-500', hex: uicolors.pink['500'] },
        { class: 'bg-pink-400', hex: uicolors.pink['400'] },
        { class: 'bg-pink-300', hex: uicolors.pink['300'] },
        {
          class: 'bg-pink-200 dark:bg-opacity-80',
          hex: uicolors.pink['200'] + 'CC',
        },
      ];

      this.expenses = topExpenses.map((d, i) => ({
        account: d.account,
        total: d.total,
        color: { color: shades[i].hex, darkColor: darkshades[i].hex },
        class: { class: shades[i].class, darkClass: darkshades[i].class },
      }));
    },
  },
});
</script>
