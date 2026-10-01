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
      :viewport-class="isMobile ? undefined : 'px-3 pb-10 pt-5 sm:px-5'"
    >
      <div
        class="space-y-4 px-4 pt-3 max-md:pb-[calc(env(safe-area-inset-bottom)+5rem)] md:mx-auto md:max-w-4xl md:space-y-6 md:p-0"
      >
        <div
          class="grid grid-cols-2 gap-3 md:gap-x-8 md:gap-y-6 xl:grid-cols-4"
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
        <div class="border-t border-outline-gray-2 max-md:hidden" />
        <Cashflow class="h-64 md:h-72" :period="period" />
        <div class="border-t border-outline-gray-2 max-md:hidden" />
        <div class="grid gap-4 md:gap-8 lg:grid-cols-2">
          <ProfitAndLoss class="h-64 min-w-0 md:h-80" :period="period" />
          <Expenses class="h-96 min-w-0 md:h-80" :period="period" />
        </div>
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
