<template>
  <FrappeBottomSheet
    :open="open"
    :title="t`Cart`"
    @update:open="(value: boolean) => $emit('update:open', value)"
  >
    <div class="flex flex-col pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div class="px-4 pb-3">
        <MultiLabelLink
          v-if="sinvDoc.fieldMap"
          class="w-full"
          secondary-link="phone"
          :border="true"
          :value="sinvDoc.party"
          :df="sinvDoc.fieldMap.party"
          :show-clear-button="true"
          @change="(party: string) => $emit('setCustomer', party)"
        />
      </div>

      <!-- Rows hold a stepper, so a stretched button under it opens the row. -->
      <FrappeList class="list-row-px-4" :columns="['minmax(0,1fr)', 'auto']">
        <FrappeListRow
          v-for="row in sinvDoc.items ?? []"
          :key="row.name"
          class="py-2.5"
        >
          <FrappeListCell>
            <button
              type="button"
              class="absolute inset-0"
              :aria-label="row.item"
              :disabled="!!row.is_free_item"
              @click="$emit('edit', row)"
            />
            <div class="min-w-0">
              <div class="truncate text-lg text-ink-gray-8">{{ row.item }}</div>
              <div class="mt-0.5 truncate text-md tabular-nums text-ink-gray-5">
                {{ getRowMeta(row) }}
              </div>
            </div>
          </FrappeListCell>
          <FrappeListCell class="justify-end">
            <MobileStepper
              v-if="!row.is_free_item"
              class="relative w-32"
              removable
              :min="1"
              :value="getQuantity(row)"
              :df="{
                fieldname: quantityField,
                fieldtype: 'Float',
                label: t`Quantity of ${row.item ?? ''}`,
              }"
              @change="(quantity: number) => setQuantity(row, quantity)"
              @remove="row.parentdoc?.remove('items', row.idx as number)"
            />
            <span v-else class="text-lg tabular-nums text-ink-gray-7">
              {{ getQuantity(row) }}
            </span>
          </FrappeListCell>
        </FrappeListRow>
      </FrappeList>

      <dl
        class="flex flex-col gap-2 border-t border-outline-gray-1 px-4 py-3 text-md tabular-nums"
      >
        <div
          v-for="total in totals"
          :key="total.label"
          class="flex justify-between gap-4"
          :class="
            total.strong ? 'text-md-semibold text-ink-gray-8' : 'text-ink-gray-7'
          "
        >
          <dt>{{ total.label }}</dt>
          <dd dir="ltr">{{ fyo.format(total.value, 'Currency') }}</dd>
        </div>
      </dl>

      <div class="flex gap-2 px-4 pt-2">
        <FrappeButton
          class="flex-1"
          size="lg"
          :label="t`Hold`"
          @click="$emit('hold')"
        />
        <FrappeButton
          class="flex-[2]"
          size="lg"
          variant="solid"
          :disabled="disablePay"
          :label="payLabel"
          @click="$emit('pay')"
        />
      </div>
    </div>
  </FrappeBottomSheet>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import MobileStepper from 'src/components/POS/MobileStepper.vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  CostLine,
  getCostLines,
  getPOSQuantityField,
  refillSerialNumbers,
  setPOSRowQuantity,
} from 'src/utils/pos';
import { computed, inject, type Ref } from 'vue';

/** The cart sheet: customer, lines with quantity steppers, totals, Hold and Pay. */
defineProps<{ open: boolean; disablePay: boolean }>();

defineEmits<{
  'update:open': [open: boolean];
  setCustomer: [party: string];
  edit: [row: SalesInvoiceItem];
  hold: [];
  pay: [];
}>();

const sinvDoc = inject('sinvDoc') as Ref<SalesInvoice>;
const quantityField = getPOSQuantityField();

const totals = computed<(CostLine & { strong?: boolean })[]>(() => [
  ...getCostLines(sinvDoc.value),
  {
    label: t`Grand Total`,
    value: sinvDoc.value.grand_total ?? fyo.pesa(0),
    strong: true,
  },
]);

const payLabel = computed(() => {
  const amount = fyo.format(sinvDoc.value.grand_total ?? 0, 'Currency');
  return sinvDoc.value.isReturn ? t`Refund ${amount}` : t`Pay ${amount}`;
});

function getQuantity(row: SalesInvoiceItem): number {
  return Math.abs(row[quantityField] ?? row.quantity ?? 0);
}

function getRowMeta(row: SalesInvoiceItem): string {
  const rate = fyo.format(row.transfer_rate ?? 0, 'Currency');
  return [rate, row.tax, row.pricing_rule].filter(Boolean).join(' · ');
}

async function setQuantity(row: SalesInvoiceItem, quantity: number) {
  try {
    await setPOSRowQuantity(row, quantityField, quantity);
    refillSerialNumbers(row);
  } catch (error) {
    showToast({ type: 'error', message: t`${error as string}` });
  }
}
</script>
