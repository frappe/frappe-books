<template>
  <dl class="flex flex-col gap-2 text-base" :aria-label="t`Order totals`">
    <div
      v-for="(line, index) in costLines"
      :key="line.label"
      class="flex items-baseline justify-between gap-4 text-ink-gray-6"
    >
      <dt>{{ index ? line.label : `${line.label} · ${quantityLabel}` }}</dt>
      <dd
        class="tabular-nums"
        :class="line.isDiscount ? 'text-ink-green-5' : 'text-ink-gray-8'"
      >
        {{ fyo.format(line.value, 'Currency') }}
      </dd>
    </div>
    <div
      class="flex flex-wrap items-baseline justify-between gap-2 border-t border-outline-gray-1 pt-2"
    >
      <dt class="text-md-medium text-ink-gray-8">{{ t`Grand total` }}</dt>
      <dd class="text-4xl-semibold tabular-nums text-ink-gray-9">
        {{ fyo.format(sinvDoc?.grand_total ?? fyo.pesa(0), 'Currency') }}
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { fyo } from 'src/initFyo';
import { getCostLines } from 'src/utils/pos';
import { computed } from 'vue';

const props = defineProps<{
  sinvDoc?: SalesInvoice;
  totalQuantity?: number;
}>();

const costLines = computed(() =>
  props.sinvDoc ? getCostLines(props.sinvDoc) : []
);

const quantityLabel = computed(() => {
  const quantity = props.totalQuantity ?? 0;
  return quantity === 1 ? t`1 item` : t`${quantity} items`;
});
</script>
