<template>
  <div v-for="card in cards" :key="card.title" :class="cardClass">
    <!-- The card clips at its top edge and the link button overflows the
      title row; the negative margin makes room without moving the card
      (frappe/frappe-ui#1255). -->
    <FrappeNumberCard
      :title="card.title"
      :value="card.value"
      :format="valueFormat"
      :loading="!isLoaded"
      :error="error"
      :card="false"
      class="-mt-2 pt-2"
    >
      <template v-if="summary && card.count" #actions>
        <FrappeButton
          variant="ghost"
          :size="isMobile ? 'md' : 'sm'"
          icon="lucide-arrow-up-right"
          :label="card.linkLabel"
          :tooltip="card.linkLabel"
          :route="getListRoute(summary, card.paid)"
        />
      </template>
      <template #error>
        <ChartLoadError @retry="loadData" />
      </template>
    </FrappeNumberCard>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton } from 'frappe-ui';
import { NumberCard as FrappeNumberCard } from 'frappe-ui/charts';
import { getDoctypeLabel, toSchemaName } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import {
  getInvoiceListFilters,
  getInvoiceSummary,
  InvoiceSummary,
} from 'src/utils/dashboard';
import { defineComponent } from 'vue';
import BaseDashboardChart from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';

/** Paid and unpaid totals of an invoice doctype, each opening its list. */
export default defineComponent({
  name: 'InvoiceCards',
  components: {
    ChartLoadError,
    FrappeButton,
    FrappeNumberCard,
  },
  extends: BaseDashboardChart,
  props: {
    doctype: { type: String, required: true },
    label: { type: String, required: true },
  },
  data() {
    return { summary: null as InvoiceSummary | null };
  },
  computed: {
    cards() {
      const { summary, label } = this;
      return [
        {
          paid: true,
          title: t`Paid ${label}`,
          value: summary?.paid ?? null,
          count: summary?.paid_count ?? 0,
          linkLabel: t`View Paid Invoices`,
        },
        {
          paid: false,
          title: t`Unpaid ${label}`,
          value: summary?.unpaid ?? null,
          count: summary?.unpaid_count ?? 0,
          linkLabel: t`View Unpaid Invoices`,
        },
      ];
    },
    valueFormat(): (value: number) => string {
      return this.isMobile
        ? this.compactCurrency
        : (value) => fyo.format(value, 'Currency');
    },
  },
  methods: {
    getListRoute(summary: InvoiceSummary, paid: boolean) {
      const schemaLabel = getDoctypeLabel(this.doctype);
      const label = paid ? t`Paid ${schemaLabel}` : t`Unpaid ${schemaLabel}`;
      const filters = getInvoiceListFilters(summary, paid);
      return {
        path: `/list/${toSchemaName(this.doctype)}/${label}`,
        query: { filters: JSON.stringify(filters) },
      };
    },
    async setData() {
      this.summary = await getInvoiceSummary(this.doctype, this.period);
    },
  },
});
</script>
