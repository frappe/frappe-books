<template>
  <section class="flex flex-col gap-4" :aria-label="t`Order totals`">
    <dl class="flex flex-col gap-2 text-sm">
      <div class="flex items-baseline justify-between gap-4">
        <dt class="text-ink-gray-6">{{ t`Total Quantity` }}</dt>
        <dd class="text-sm-medium tabular-nums text-ink-gray-9">
          {{ fyo.format(totalQuantity, 'Float') }}
        </dd>
      </div>
      <div
        v-for="line in costLines"
        :key="line.label"
        class="flex items-baseline justify-between gap-4"
      >
        <dt class="text-ink-gray-6">{{ line.label }}</dt>
        <dd class="text-sm-medium tabular-nums text-ink-gray-9">
          {{ fyo.format(line.value, 'Currency') }}
        </dd>
      </div>
      <div
        class="flex flex-wrap items-baseline justify-between gap-2 border-t border-outline-gray-1 pt-3"
      >
        <dt class="text-base-medium text-ink-gray-9">
          {{ t`Grand Total` }}
        </dt>
        <dd class="text-xl-semibold tabular-nums text-ink-gray-9">
          {{ fyo.format(sinvDoc?.grand_total ?? fyo.pesa(0), 'Currency') }}
        </dd>
      </div>
    </dl>
  </section>
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
</script>
