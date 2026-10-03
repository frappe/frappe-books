<template>
  <section class="flex min-w-0 flex-col gap-2">
    <h3 class="text-base-medium text-ink-gray-8">{{ heading }}</h3>
    <div
      class="flex flex-col rounded-5 border border-outline-gray-1 text-base tabular-nums"
    >
      <div
        class="grid h-8 items-center gap-3 rounded-t-5 bg-surface-gray-1 px-3 text-sm text-ink-gray-5"
        :class="columns"
      >
        <span>{{ t`Denomination` }}</span>
        <span class="text-center">{{ t`Count` }}</span>
        <span class="text-end">{{ t`Amount` }}</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.idx"
        class="grid h-10 items-center gap-3 border-t border-outline-gray-1 px-3 text-ink-gray-8"
        :class="columns"
      >
        <span class="truncate" dir="ltr">{{ format(row.denomination) }}</span>
        <NumberStepper
          size="sm"
          :value="row.count ?? 0"
          :df="{
            fieldname: 'count',
            fieldtype: 'Int',
            label: t`Count of ${format(row.denomination)}`,
          }"
          @change="(count: number) => row.set('count', Math.max(count, 0))"
        />
        <span class="truncate text-end" dir="ltr">
          {{ format(row.denomination?.mul(row.count ?? 0)) }}
        </span>
      </div>
      <p
        v-if="!rows.length"
        class="border-t border-outline-gray-1 px-3 py-2.5 text-p-sm text-ink-gray-6"
      >
        {{ t`Set Cash Denominations in Settings to count cash here.` }}
      </p>
      <div
        class="grid h-10 items-center gap-3 rounded-b-5 border-t border-outline-gray-1 bg-surface-gray-1 px-3 text-base-medium text-ink-gray-8"
        :class="columns"
      >
        <span>{{ t`Total` }}</span>
        <span />
        <span class="text-end" dir="ltr">
          {{ format(getCashTotal(fyo.pesa(0), rows)) }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  CashCount,
  getCashTotal,
} from 'models/inventory/Point of Sale/POSOpeningShift';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import NumberStepper from './NumberStepper.vue';

/** Cash counted by denomination, as a table with its total. */
defineProps<{ heading: string; rows: CashCount[] }>();

const columns = 'grid-cols-[minmax(0,1fr)_6rem_6rem]';

function format(amount?: Money): string {
  return fyo.format(amount ?? fyo.pesa(0), 'Currency');
}
</script>
