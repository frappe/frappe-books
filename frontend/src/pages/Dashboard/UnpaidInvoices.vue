<template>
  <div class="flex-col justify-between w-full p-4">
    <!-- Title and Period Selector -->
    <SectionHeader>
      <template #title>{{ title }}</template>
    </SectionHeader>

    <!-- Widget Body -->
    <div class="mt-4">
      <!-- Paid & Unpaid Amounts -->
      <div class="flex justify-between">
        <!-- Paid -->
        <FrappeButton
          class="text-sm font-medium text-ink-gray-8"
          variant="ghost"
          :disabled="paidCount === 0"
          :tooltip="paidCount > 0 ? t`View Paid Invoices` : undefined"
          @click="routeToInvoices('paid')"
        >
          {{ fyo.format(paid, 'Currency') }}
          <span :class="{ 'text-ink-gray-9 font-normal': count }">{{
            t`Paid`
          }}</span>
        </FrappeButton>

        <!-- Unpaid -->
        <FrappeButton
          class="text-sm font-medium text-ink-gray-8"
          variant="ghost"
          :disabled="unpaidCount === 0"
          :tooltip="unpaidCount > 0 ? t`View Unpaid Invoices` : undefined"
          @click="routeToInvoices('unpaid')"
        >
          {{ fyo.format(unpaid, 'Currency') }}
          <span :class="{ 'text-ink-gray-9 font-normal': count }">{{
            t`Unpaid`
          }}</span>
        </FrappeButton>
      </div>

      <!-- Widget Bar -->
      <FrappeTooltip :disabled="!hasData" :hover-delay="0" side="top">
        <div class="relative mt-2 overflow-hidden rounded-2">
          <div class="h-4 w-full" :class="unpaidColor"></div>
          <div
            class="absolute inset-0 h-4"
            :class="paidColor"
            :style="`width: ${barWidth}%`"
          ></div>
        </div>
        <template #content>
          <div class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
            <span>{{ t`Paid` }}</span>
            <strong class="text-end tabular-nums">{{ paidCount }}</strong>
            <span v-if="unpaidCount">{{ t`Unpaid` }}</span>
            <strong v-if="unpaidCount" class="text-end tabular-nums">
              {{ unpaidCount }}
            </strong>
          </div>
        </template>
      </FrappeTooltip>
    </div>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton, Tooltip as FrappeTooltip } from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { getInvoiceSummary, InvoiceSummary } from 'src/utils/dashboard';
import { PeriodKey } from 'src/utils/types';
import { routeTo } from 'src/utils/ui';
import { PropType, defineComponent } from 'vue';
import BaseDashboardChart from './BaseDashboardChart.vue';
import SectionHeader from './SectionHeader.vue';

export default defineComponent({
  name: 'UnpaidInvoices',
  components: {
    SectionHeader,
    FrappeButton,
    FrappeTooltip,
  },
  extends: BaseDashboardChart,
  props: {
    schemaName: { type: String as PropType<string>, required: true },
    doctype: { type: String as PropType<string>, required: true },
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      summary: null as InvoiceSummary | null,
      period: 'This Year' as PeriodKey,
    };
  },
  computed: {
    title(): string {
      return fyo.schemaMap[this.schemaName]?.label ?? '';
    },
    paid(): number {
      return this.summary?.paid ?? 0;
    },
    unpaid(): number {
      return this.summary?.unpaid ?? 0;
    },
    paidCount(): number {
      return this.summary?.paid_count ?? 0;
    },
    unpaidCount(): number {
      return this.summary?.unpaid_count ?? 0;
    },
    count(): number {
      return this.paidCount + this.unpaidCount;
    },
    hasData(): boolean {
      return this.count > 0;
    },
    barWidth(): number {
      return (this.paid / (this.summary?.total || 1)) * 100;
    },
    color(): 'blue' | 'pink' {
      if (this.schemaName === ModelNameEnum.SalesInvoice) {
        return 'blue';
      }
      return 'pink';
    },
    paidColor(): string {
      if (!this.hasData) {
        return this.darkMode ? 'bg-gray-700' : 'bg-gray-400';
      }

      return `bg-${this.color}-${this.darkMode ? '600' : '500'}`;
    },
    unpaidColor(): string {
      if (!this.hasData) {
        return `bg-gray-${this.darkMode ? '800' : '200'}`;
      }

      return `bg-${this.color}-${this.darkMode ? '700 bg-opacity-20' : '200'}`;
    },
  },
  async activated() {
    await this.setData();
  },
  methods: {
    async routeToInvoices(type: 'paid' | 'unpaid') {
      const count = type === 'paid' ? this.paidCount : this.unpaidCount;
      if (!this.summary || !count) {
        return;
      }

      const zero = this.fyo.pesa(0).store;
      const filters = { outstandingAmount: ['=', zero] };
      const schemaLabel = fyo.schemaMap[this.schemaName]?.label ?? '';
      let label = t`Paid ${schemaLabel}`;
      if (type === 'unpaid') {
        filters.outstandingAmount[0] = '!=';
        label = t`Unpaid ${schemaLabel}`;
      }

      const path = `/list/${this.schemaName}/${label}`;
      const query = { filters: JSON.stringify(filters) };
      await routeTo({ path, query });
    },
    async setData() {
      this.summary = await getInvoiceSummary(this.doctype, this.period);
    },
  },
});
</script>
