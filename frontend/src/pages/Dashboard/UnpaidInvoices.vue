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
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { getDatesAndPeriodList } from 'src/utils/misc';
import { PeriodKey } from 'src/utils/types';
import { routeTo } from 'src/utils/ui';
import { safeParseFloat } from 'utils/index';
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
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      total: 0,
      unpaid: 0,
      hasData: false,
      paid: 0,
      count: 0,
      unpaidCount: 0,
      paidCount: 0,
      barWidth: 40,
      period: 'This Year',
    } as {
      period: PeriodKey;
      total: number;
      unpaid: number;
      hasData: boolean;
      paid: number;
      count: number;
      unpaidCount: number;
      paidCount: number;
      barWidth: number;
    };
  },
  computed: {
    title(): string {
      return fyo.schemaMap[this.schemaName]?.label ?? '';
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
      if (type === 'paid' && !this.paidCount) {
        return;
      }

      if (type === 'unpaid' && !this.unpaidCount) {
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
      const { fromDate, toDate } = getDatesAndPeriodList(this.period);

      const { total, outstanding } = await fyo.db.getTotalOutstanding(
        this.schemaName,
        fromDate.toISO(),
        toDate.toISO(),
      );

      const { countTotal, countOutstanding } = await this.getCounts(
        this.schemaName,
        fromDate,
        toDate,
      );

      this.total = total ?? 0;
      this.unpaid = outstanding ?? 0;
      this.paid = total - outstanding;
      this.hasData = countTotal > 0;
      this.count = countTotal;
      this.paidCount = countTotal - countOutstanding;
      this.unpaidCount = countOutstanding;
      this.barWidth = (this.paid / (this.total || 1)) * 100;
    },
    async newInvoice() {
      const doc = fyo.doc.getNewDoc(this.schemaName);
      await routeTo(`/edit/${this.schemaName}/${doc.name!}`);
    },

    async getCounts(schemaName: string, fromDate: DateTime, toDate: DateTime) {
      const outstandingAmounts = await fyo.db.getAllRaw(schemaName, {
        fields: ['outstandingAmount'],
        filters: {
          cancelled: false,
          submitted: true,
          date: ['<=', toDate.toISO(), '>=', fromDate.toISO()],
        },
      });

      const isOutstanding = outstandingAmounts.map((o) => safeParseFloat(o.outstandingAmount));

      return {
        countTotal: isOutstanding.length,
        countOutstanding: isOutstanding.filter((o) => o > 0).length,
      };
    },
  },
});
</script>
