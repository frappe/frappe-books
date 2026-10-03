<template>
  <FrappeBottomSheet
    :open="!!row"
    :title="row?.item ?? ''"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <div
      v-if="row"
      class="flex flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormControl
          :class="isDiscountingEnabled ? '' : 'col-span-2'"
          :df="row.fieldMap.transfer_rate"
          :value="row.transfer_rate"
          :show-label="true"
          :border="true"
          :required="false"
          :read-only="isPOSRowFieldReadOnly(row, 'transfer_rate', permissions)"
          @change="(value: Money) => setValue('transfer_rate', value)"
        />
        <FormControl
          v-if="isDiscountingEnabled"
          :df="{
            fieldname: 'itemDiscountPercent',
            fieldtype: 'Float',
            label: t`Discount %`,
          }"
          :value="row.item_discount_percent"
          :show-label="true"
          :border="true"
          :read-only="
            isPOSRowFieldReadOnly(row, 'item_discount_percent', permissions)
          "
          @change="(value: number) => setValue('item_discount_percent', value)"
        />
      </div>
      <div v-if="row.batch" class="grid grid-cols-2 gap-3">
        <FormControl
          :df="{ fieldname: 'batch', fieldtype: 'Data', label: t`Batch` }"
          :value="row.batch"
          :show-label="true"
          :border="true"
          :read-only="true"
        />
        <FormControl
          :df="{
            fieldname: 'availableQtyInBatch',
            fieldtype: 'Float',
            label: t`Qty in Batch`,
          }"
          :value="batchQuantity"
          :show-label="true"
          :border="true"
          :read-only="true"
        />
      </div>
      <div
        class="flex justify-between gap-4 text-lg-semibold tabular-nums text-ink-gray-8"
      >
        <span>{{ t`Amount` }}</span>
        <span dir="ltr">{{ fyo.format(row.amount ?? 0, 'Currency') }}</span>
      </div>
      <div class="flex gap-2">
        <FrappeButton
          size="lg"
          theme="red"
          variant="ghost"
          icon-left="lucide-trash-2"
          :label="t`Remove`"
          @click="remove(row)"
        />
        <FrappeButton
          class="flex-1"
          size="lg"
          variant="solid"
          :label="t`Done`"
          @click="$emit('close')"
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
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import { Money } from 'pesa';
import FormControl from 'src/components/Controls/FormControl.vue';
import { POS_ITEM_TOAST_ID } from 'src/components/POS/types';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  isPOSRowFieldReadOnly,
  POSRowField,
  setPOSRowValue,
} from 'src/utils/posCart';
import { getPOSPermissions, POSPermissions } from 'src/utils/posSetup';
import { usePOSBatchQuantity } from 'src/utils/usePOSBatchQuantity';
import { inject, onMounted, ref, type Ref } from 'vue';

/** Edits a cart line's rate and discount, and shows its batch stock. */
const props = defineProps<{ row: SalesInvoiceItem | null }>();
const emit = defineEmits<{ close: [] }>();
const batchQuantity = usePOSBatchQuantity(() => props.row);

const isDiscountingEnabled = inject('isDiscountingEnabled') as Ref<boolean>;
const permissions = ref<POSPermissions>({
  canChangeRate: false,
  canEditDiscount: false,
});

onMounted(async () => {
  permissions.value = await getPOSPermissions();
});

async function setValue(field: POSRowField, value: number | Money) {
  try {
    await setPOSRowValue(props.row!, field, value);
  } catch (error) {
    showToast({
      id: POS_ITEM_TOAST_ID,
      type: 'error',
      message: t`${error as string}`,
    });
  }
}

async function remove(row: SalesInvoiceItem) {
  emit('close');
  await row.parentdoc?.remove('items', row.idx as number);
}
</script>
