<template>
  <div class="flex min-h-0 flex-col">
    <PageHeader :title="t`Dashboard`" title-start>
      <template #mobile>
        <FrappeButton
          variant="ghost"
          size="md"
          icon="lucide-search"
          :label="t`Search`"
          @click="$router.push('/search')"
        />
        <PeriodSelector :value="period" @change="(value) => (period = value)" />
      </template>
      <PeriodSelector
        :value="period"
        :options="['This Year', 'This Quarter', 'This Month', 'YTD']"
        @change="(value) => (period = value)"
      />
    </PageHeader>

    <div class="no-scrollbar min-h-0 flex-1 overflow-auto bg-surface-base">
      <div class="min-w-0 max-md:pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <Cashflow class="p-4" :common-period="period" />
        <hr class="border-outline-gray-1" />
        <div class="grid grid-cols-1 md:grid-cols-2">
          <UnpaidInvoices
            doctype="Books Sales Invoice"
            :common-period="period"
            class="min-w-0 border-outline-gray-1 max-md:border-b md:border-e"
          />
          <UnpaidInvoices
            doctype="Books Purchase Invoice"
            :common-period="period"
          />
        </div>
        <hr class="border-outline-gray-1" />
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <ProfitAndLoss
            class="min-w-0 w-full p-4 border-outline-gray-1 max-md:border-b md:border-e"
            :common-period="period"
          />
          <Expenses
            class="min-w-0 w-full p-4"
            :common-period="period"
          />
        </div>
        <hr class="border-outline-gray-1" />
      </div>
    </div>
    <MobileCreateButton v-if="isMobile" />
  </div>
</template>

<script>
import { Button as FrappeButton } from 'frappe-ui';
import PageHeader from 'src/components/PageHeader.vue';
import UnpaidInvoices from './UnpaidInvoices.vue';
import Cashflow from './Cashflow.vue';
import Expenses from './Expenses.vue';
import MobileCreateButton from './MobileCreateButton.vue';
import PeriodSelector from './PeriodSelector.vue';
import ProfitAndLoss from './ProfitAndLoss.vue';
import { docsPathRef } from 'src/utils/refs';
import { isMobile } from 'src/utils/viewport';

export default {
  name: 'Dashboard',
  components: {
    FrappeButton,
    PageHeader,
    Cashflow,
    ProfitAndLoss,
    Expenses,
    MobileCreateButton,
    PeriodSelector,
    UnpaidInvoices,
  },
  setup() {
    return { isMobile };
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
