<template>
  <div class="flex min-h-0 flex-col">
    <PageHeader :title="t`Dashboard`">
      <template #mobile>
        <MobileCreateMenu />
      </template>
      <PeriodSelector :value="period" @change="(value) => (period = value)" />
    </PageHeader>

    <!-- Phones scroll in the shell. -->
    <component
      :is="isMobile ? 'div' : 'FrappeScrollArea'"
      class="min-h-0 flex-1"
      :viewport-class="isMobile ? undefined : 'px-3 pb-10 pt-5 sm:px-5'"
    >
      <div
        class="space-y-4 px-4 pb-10 pt-3 md:mx-auto md:max-w-4xl md:space-y-6 md:p-0"
      >
        <PeriodSelector
          v-if="isMobile"
          :value="period"
          @change="(value) => (period = value)"
        />
        <div
          class="grid grid-cols-2 gap-3 md:gap-x-8 md:gap-y-6 xl:grid-cols-4"
        >
          <InvoiceCards
            v-if="canRead.sales"
            doctype="Books Sales Invoice"
            :paid-title="t`Paid sales`"
            :unpaid-title="t`Unpaid sales`"
            :period="period"
          />
          <InvoiceCards
            v-if="canRead.purchases"
            doctype="Books Purchase Invoice"
            :paid-title="t`Paid purchases`"
            :unpaid-title="t`Unpaid purchases`"
            :period="period"
          />
        </div>
        <!-- The charts total the ledger. -->
        <template v-if="canRead.ledger">
          <div class="border-t border-outline-gray-2 max-md:hidden" />
          <Cashflow class="h-64 md:h-72" :period="period" />
          <div class="border-t border-outline-gray-2 max-md:hidden" />
          <div class="grid gap-4 md:gap-8 lg:grid-cols-2">
            <ProfitAndLoss class="h-64 min-w-0 md:h-80" :period="period" />
            <Expenses class="h-96 min-w-0 md:h-80" :period="period" />
          </div>
        </template>
      </div>
    </component>
  </div>
</template>

<script>
import { ScrollArea as FrappeScrollArea } from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import PageHeader from 'src/components/PageHeader.vue';
import Cashflow from './Cashflow.vue';
import Expenses from './Expenses.vue';
import InvoiceCards from './InvoiceCards.vue';
import MobileCreateMenu from './MobileCreateMenu.vue';
import PeriodSelector from './PeriodSelector.vue';
import ProfitAndLoss from './ProfitAndLoss.vue';
import { fyo } from 'src/initFyo';
import { docsPathRef } from 'src/utils/refs';
import { isMobile } from 'src/utils/viewport';

export default {
  name: 'Dashboard',
  components: {
    FrappeScrollArea,
    PageHeader,
    Cashflow,
    ProfitAndLoss,
    Expenses,
    InvoiceCards,
    MobileCreateMenu,
    PeriodSelector,
  },
  setup() {
    const canRead = {
      sales: fyo.can(ModelNameEnum.SalesInvoice, 'read'),
      purchases: fyo.can(ModelNameEnum.PurchaseInvoice, 'read'),
      ledger: fyo.can(ModelNameEnum.AccountingLedgerEntry, 'read'),
    };
    return { isMobile, canRead };
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
