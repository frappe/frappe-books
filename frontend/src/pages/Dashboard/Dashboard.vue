<template>
  <div class="flex min-h-0 flex-col">
    <PageHeader :title="t`Dashboard`">
      <PeriodSelector
        :value="period"
        :options="['This Year', 'This Quarter', 'This Month', 'YTD']"
        @change="(value) => (period = value)"
      />
    </PageHeader>

    <div class="no-scrollbar min-h-0 flex-1 overflow-auto bg-surface-base">
      <div class="min-w-0">
        <Cashflow class="p-4" :common-period="period" :dark-mode="darkMode" />
        <hr class="border-outline-gray-1" />
        <div class="grid grid-cols-1 md:grid-cols-2">
          <UnpaidInvoices
            :schema-name="'SalesInvoice'"
            :common-period="period"
            :dark-mode="darkMode"
            class="min-w-0 border-e border-outline-gray-1"
          />
          <UnpaidInvoices
            :schema-name="'PurchaseInvoice'"
            :common-period="period"
            :dark-mode="darkMode"
          />
        </div>
        <hr class="border-outline-gray-1" />
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <ProfitAndLoss
            class="min-w-0 w-full p-4 border-e border-outline-gray-1"
            :common-period="period"
            :dark-mode="darkMode"
          />
          <Expenses
            class="min-w-0 w-full p-4"
            :common-period="period"
            :dark-mode="darkMode"
          />
        </div>
        <hr class="border-outline-gray-1" />
      </div>
    </div>
  </div>
</template>

<script>
import PageHeader from 'src/components/PageHeader.vue';
import UnpaidInvoices from './UnpaidInvoices.vue';
import Cashflow from './Cashflow.vue';
import Expenses from './Expenses.vue';
import PeriodSelector from './PeriodSelector.vue';
import ProfitAndLoss from './ProfitAndLoss.vue';
import { docsPathRef } from 'src/utils/refs';

export default {
  name: 'Dashboard',
  components: {
    PageHeader,
    Cashflow,
    ProfitAndLoss,
    Expenses,
    PeriodSelector,
    UnpaidInvoices,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return { period: 'This Year' };
  },
  activated() {
    docsPathRef.value = 'books/dashboard';
  },
  deactivated() {
    docsPathRef.value = '';
  },
};
</script>
