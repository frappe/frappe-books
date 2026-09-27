<template>
  <template v-if="options.length">
    <button
      v-if="!isDrawerOpen && !isOpen"
      type="button"
      :aria-label="t`Create`"
      class="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] end-4 z-30 flex size-14 items-center justify-center rounded-full bg-surface-gray-10 text-ink-base shadow-lg active:bg-surface-gray-8"
      @click="isOpen = true"
    >
      <FrappeIcon icon="lucide-plus" class="size-6" />
    </button>
    <FrappeBottomSheet v-model:open="isOpen" :title="t`Create`">
      <div
        class="grid grid-cols-3 gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <button
          v-for="option in options"
          :key="option.label"
          type="button"
          class="flex min-h-[88px] flex-col items-center justify-center gap-2.5 rounded-6 bg-surface-gray-1 p-2 text-center text-sm-medium leading-tight text-ink-gray-8 active:bg-surface-gray-3"
          @click="create(option)"
        >
          <FrappeIcon :icon="option.icon" class="size-[22px] text-ink-gray-7" />
          {{ option.label }}
        </button>
      </div>
    </FrappeBottomSheet>
  </template>
</template>
<script setup lang="ts">
import { t } from 'fyo';
import type { RawValueMap } from 'fyo/core/types';
import {
  BottomSheet as FrappeBottomSheet,
  Icon as FrappeIcon,
} from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { createFilters } from 'src/utils/filters';
import { isDrawerOpenKey } from 'src/utils/injectionKeys';
import { openNewDoc } from 'src/utils/ui';
import { inject, ref } from 'vue';

interface CreateOption {
  label: string;
  icon: string;
  schemaName: string;
  initData?: RawValueMap;
}

const isDrawerOpen = inject(isDrawerOpenKey, ref(false));
const isOpen = ref(false);

const options = (
  [
    {
      label: t`Sales Invoice`,
      icon: 'lucide-receipt-text',
      schemaName: ModelNameEnum.SalesInvoice,
    },
    {
      label: t`Receive Payment`,
      icon: 'lucide-hand-coins',
      schemaName: ModelNameEnum.Payment,
      initData: createFilters.SalesPayments,
    },
    {
      label: t`Purchase Invoice`,
      icon: 'lucide-receipt-indian-rupee',
      schemaName: ModelNameEnum.PurchaseInvoice,
    },
    {
      label: t`Make Payment`,
      icon: 'lucide-coins',
      schemaName: ModelNameEnum.Payment,
      initData: createFilters.PurchasePayments,
    },
    {
      label: t`Customer`,
      icon: 'lucide-user-round',
      schemaName: ModelNameEnum.Party,
      initData: createFilters.Customers,
    },
    { label: t`Item`, icon: 'lucide-box', schemaName: ModelNameEnum.Item },
  ] as CreateOption[]
).filter(({ schemaName }) => fyo.can(schemaName, 'create'));

async function create(option: CreateOption) {
  isOpen.value = false;
  await openNewDoc(option.schemaName, option.initData);
}
</script>
