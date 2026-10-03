<template>
  <dl
    class="flex flex-col divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-1 text-base tabular-nums"
    :aria-label="t`Payment summary`"
  >
    <div
      v-for="row in detailRows"
      :key="row.label"
      class="flex justify-between gap-4 px-3 py-2.5 text-ink-gray-6"
    >
      <dt>{{ row.label }}</dt>
      <dd :class="row.isDiscount ? 'text-ink-green-5' : 'text-ink-gray-8'">
        {{ formatAmount(row.value) }}
      </dd>
    </div>
    <div class="flex justify-between gap-4 px-3 py-2.5 text-base-medium text-ink-gray-9">
      <dt>{{ t`Grand total` }}</dt>
      <dd>{{ formatAmount(sinvDoc.grand_total) }}</dd>
    </div>
    <div
      v-if="hasOutstanding"
      class="flex justify-between gap-4 px-3 py-2.5 text-ink-gray-6"
    >
      <dt>{{ t`Outstanding` }}</dt>
      <dd class="text-ink-gray-8">{{ formatAmount(sinvDoc.outstanding_amount) }}</dd>
    </div>
    <div
      v-if="settlement"
      class="flex justify-between gap-4 rounded-b-6 px-3 py-2.5"
      :class="
        settlement.isChange
          ? 'bg-surface-green-2 text-ink-green-7'
          : 'bg-surface-red-2 text-ink-red-7'
      "
      role="status"
    >
      <dt>{{ settlement.label }}</dt>
      <dd class="text-base-semibold">
        {{ formatAmount(settlement.amount) }}
      </dd>
    </div>
  </dl>
</template>

<script lang="ts">
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import { CostLine, getCostLines } from 'src/utils/pos';
import type { Settlement } from 'src/utils/posCheckout';
import { defineComponent, PropType } from 'vue';

/** The sale's totals, then what the tender settles. */
export default defineComponent({
  name: 'PaymentSummary',
  props: {
    sinvDoc: { type: Object as PropType<SalesInvoice>, required: true },
    settlement: {
      type: Object as PropType<Settlement | null>,
      default: null,
    },
  },
  computed: {
    detailRows(): CostLine[] {
      const rows = getCostLines(this.sinvDoc);
      if (this.hasDistinctBaseTotal) {
        rows.push({
          label: this.fyo.t`Base grand total`,
          value: this.sinvDoc.base_grand_total!,
        });
      }

      return rows;
    },
    hasDistinctBaseTotal(): boolean {
      const baseTotal = this.sinvDoc.base_grand_total;
      const grandTotal = this.sinvDoc.grand_total;
      return Boolean(baseTotal && grandTotal && !baseTotal.eq(grandTotal));
    },
    /** A submitted invoice may owe less than its total. */
    hasOutstanding(): boolean {
      return !!this.sinvDoc.isSubmitted;
    },
  },
  methods: {
    formatAmount(value: Money | undefined): string {
      return fyo.format(value ?? fyo.pesa(0), 'Currency');
    },
  },
});
</script>
