<template>
  <FrappeBottomSheet
    :open="open"
    :title="t`Point of Sale`"
    @update:open="(value: boolean) => $emit('update:open', value)"
  >
    <nav
      class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      :aria-label="t`Point of Sale`"
    >
      <template v-for="action in actions" :key="action.name">
        <div
          v-if="action.name === 'ShiftClose'"
          class="mx-3 my-1 border-t border-outline-gray-1"
        />
        <button
          type="button"
          class="flex h-[52px] w-full items-center gap-3 rounded-5 px-3 text-start text-lg text-ink-gray-8 active:bg-surface-gray-2"
          @click="$emit('select', action.name)"
        >
          <FrappeIcon :icon="action.icon" class="size-[18px]" />
          <span class="min-w-0 flex-1 truncate">{{ action.label }}</span>
          <span v-if="action.count" class="text-base text-ink-gray-5">
            {{ action.count }}
          </span>
        </button>
      </template>
    </nav>
  </FrappeBottomSheet>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Icon as FrappeIcon,
} from 'frappe-ui';
import { ModalName } from 'src/components/POS/types';
import { getCount, type Filter } from 'src/frappe/api';
import { fyo } from 'src/initFyo';
import { computed, ref, watch } from 'vue';

type MenuAction = {
  name: ModalName;
  label: string;
  icon: string;
  count?: number;
  hidden?: boolean;
};

/** The phone POS ⋯ menu: the desktop quick actions and held invoices as rows. */
const props = defineProps<{
  open: boolean;
  enableReturns: boolean;
  loyaltyProgram: string;
  appliedCouponsCount: number;
}>();

defineEmits<{ 'update:open': [open: boolean]; select: [name: ModalName] }>();

const savedCount = ref(0);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      const filters = [
        ['is_pos', '=', 1],
        ['docstatus', '=', 0],
      ] as Filter[];
      savedCount.value = await getCount('Books Sales Invoice', filters, []);
    }
  }
);

const actions = computed(() => {
  const settings = fyo.singles.AccountingSettings;
  const all: MenuAction[] = [
    {
      name: 'SavedInvoice',
      label: t`Saved and Submitted Invoices`,
      icon: 'lucide-receipt-text',
      count: savedCount.value,
    },
    {
      name: 'ReturnSalesInvoice',
      label: t`Return Sales Invoice`,
      icon: 'lucide-undo-2',
      hidden: !props.enableReturns,
    },
    {
      name: 'LoyaltyProgram',
      label: t`Loyalty Program`,
      icon: 'lucide-gift',
      hidden: !settings?.enable_loyalty_program || !props.loyaltyProgram,
    },
    {
      name: 'CouponCode',
      label: t`Coupon Code`,
      icon: 'lucide-ticket-percent',
      count: props.appliedCouponsCount,
      hidden: !settings?.enable_coupon_code,
    },
    {
      name: 'PriceList',
      label: t`Price List`,
      icon: 'lucide-tags',
      hidden: !settings?.enable_price_list,
    },
    {
      name: 'ItemEnquiry',
      label: t`Item Enquiry`,
      icon: 'lucide-package-search',
      hidden: !settings?.enable_item_enquiry,
    },
    {
      name: 'ShiftClose',
      label: t`Close POS Shift`,
      icon: 'lucide-log-out',
    },
  ];
  return all.filter(({ hidden }) => !hidden);
});
</script>
