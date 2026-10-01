<template>
  <div class="flex flex-col gap-3">
    <div
      class="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] gap-2 border-b border-outline-gray-1 pb-1.5 text-xs-medium text-ink-gray-5"
    >
      <span>{{ heading }}</span>
      <span class="text-center">{{ t`Count` }}</span>
      <span class="text-end">{{ t`Amount` }}</span>
    </div>
    <div
      v-for="row in rows"
      :key="row.idx"
      class="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] items-center gap-2 text-md tabular-nums text-ink-gray-8"
    >
      <span class="truncate" dir="ltr">{{ format(row.denomination) }}</span>
      <MobileStepper
        :value="row.count ?? 0"
        :df="{
          fieldname: 'count',
          fieldtype: 'Int',
          label: t`Count of ${format(row.denomination)}`,
        }"
        @change="(count: number) => setCount(row, count)"
      />
      <span class="truncate text-end" dir="ltr">
        {{ format(row.denomination?.mul(row.count ?? 0)) }}
      </span>
    </div>
    <p v-if="!rows.length" class="text-p-sm text-ink-gray-6">
      {{ t`Set Cash Denominations in Settings to count cash here.` }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { CashCount } from 'models/inventory/Point of Sale/POSOpeningShift';
import { Money } from 'pesa';
import MobileStepper from 'src/components/POS/MobileStepper.vue';
import { fyo } from 'src/initFyo';

/** Cash counted by denomination, with a stepper per note. */
defineProps<{ heading: string; rows: CashCount[] }>();
const emit = defineEmits<{ change: [] }>();

function format(amount?: Money): string {
  return fyo.format(amount ?? fyo.pesa(0), 'Currency');
}

async function setCount(row: CashCount, count: number) {
  await row.set('count', Math.max(count, 0));
  emit('change');
}
</script>
