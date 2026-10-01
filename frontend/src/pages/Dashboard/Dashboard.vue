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

    <!-- Phones scroll in the shell. -->
    <component
      :is="isMobile ? 'div' : 'FrappeScrollArea'"
      class="min-h-0 flex-1"
      :viewport-class="isMobile ? undefined : 'pb-10'"
    >
      <div class="min-w-0 max-md:pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <Cashflow class="h-72 p-4 md:px-5" :period="period" />
        <hr class="border-outline-gray-1" />
        <div
          class="grid grid-cols-2 gap-3 p-4 md:gap-x-8 md:gap-y-6 md:px-5 xl:grid-cols-4"
        >
          <InvoiceCards
            doctype="Books Sales Invoice"
            :label="t`Sales`"
            :period="period"
          />
          <InvoiceCards
            doctype="Books Purchase Invoice"
            :label="t`Purchases`"
            :period="period"
          />
        </div>
        <hr class="border-outline-gray-1" />
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <ProfitAndLoss
            class="h-80 min-w-0 w-full p-4 border-outline-gray-1 max-md:border-b md:border-e md:px-5"
            :period="period"
          />
          <Expenses
            class="h-80 min-w-0 w-full p-4 md:px-5"
            :period="period"
          />
        </div>
        <hr class="border-outline-gray-1" />
      </div>
    </component>
    <MobileCreateButton v-if="isMobile" />
  </div>
</template>

<script>
import {
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import PageHeader from 'src/components/PageHeader.vue';
import Cashflow from './Cashflow.vue';
import Expenses from './Expenses.vue';
import InvoiceCards from './InvoiceCards.vue';
import MobileCreateButton from './MobileCreateButton.vue';
import PeriodSelector from './PeriodSelector.vue';
import ProfitAndLoss from './ProfitAndLoss.vue';
import { docsPathRef } from 'src/utils/refs';
import { isMobile } from 'src/utils/viewport';

export default {
  name: 'Dashboard',
  components: {
    FrappeButton,
    FrappeScrollArea,
    PageHeader,
    Cashflow,
    ProfitAndLoss,
    Expenses,
    InvoiceCards,
    MobileCreateButton,
    PeriodSelector,
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
