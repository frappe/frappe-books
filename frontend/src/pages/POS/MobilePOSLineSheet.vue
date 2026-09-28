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
          :df="row.fieldMap.rate"
          :value="row.rate"
          :show-label="true"
          :border="true"
          :required="false"
          :read-only="isPOSRowFieldReadOnly(row, 'rate', permissions)"
          @change="(value: Money) => setValue('rate', value)"
        />
        <FormControl
          v-if="isDiscountingEnabled"
          :df="{
            fieldname: 'itemDiscountPercent',
            fieldtype: 'Float',
            label: t`Discount %`,
          }"
          :value="row.itemDiscountPercent"
          :show-label="true"
          :border="true"
          :read-only="
            isPOSRowFieldReadOnly(row, 'itemDiscountPercent', permissions)
          "
          @change="(value: number) => setValue('itemDiscountPercent', value)"
        />
      </div>
      <div
        class="flex justify-between gap-4 text-lg-semibold tabular-nums text-ink-gray-9"
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
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { Money } from 'pesa';
import FormControl from 'src/components/Controls/FormControl.vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  getPOSPermissions,
  isPOSRowFieldReadOnly,
  POSPermissions,
  POSRowField,
  setPOSRowValue,
} from 'src/utils/pos';
import { inject, onMounted, ref, type Ref } from 'vue';

/** Edits a cart line's rate and discount. */
const props = defineProps<{ row: SalesInvoiceItem | null }>();
const emit = defineEmits<{ close: [] }>();

const isDiscountingEnabled = inject('isDiscountingEnabled') as Ref<boolean>;
const permissions = ref<POSPermissions>({
  canChangeRate: false,
  canEditDiscount: false,
});

onMounted(async () => {
  permissions.value = await getPOSPermissions(fyo);
});

async function setValue(field: POSRowField, value: number | Money) {
  try {
    await setPOSRowValue(props.row!, field, value);
  } catch (error) {
    showToast({ type: 'error', message: t`${error as string}` });
  }
}

async function remove(row: SalesInvoiceItem) {
  emit('close');
  await row.parentdoc?.remove('items', row.idx as number);
}
</script>
