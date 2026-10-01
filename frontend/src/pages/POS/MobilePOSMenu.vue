<template>
  <FrappeDropdown v-model:open="open" :options="options" align="end">
    <FrappeButton
      variant="ghost"
      size="md"
      icon="lucide-ellipsis"
      :label="t`POS actions`"
    />
    <template #item-suffix="{ item }">
      <span v-if="item.count" class="text-sm tabular-nums text-ink-gray-5">
        {{ item.count }}
      </span>
    </template>
  </FrappeDropdown>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  Button as FrappeButton,
  Dropdown as FrappeDropdown,
  type DropdownOptions,
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

/** The phone POS ⋯ menu: the desktop quick actions and held invoices. */
const props = defineProps<{
  enableReturns: boolean;
  loyaltyProgram: string;
  appliedCouponsCount: number;
}>();

const emit = defineEmits<{ select: [name: ModalName] }>();
const open = defineModel<boolean>('open', { required: true });

const savedCount = ref(0);

watch(open, async (isOpen) => {
  if (isOpen) {
    const filters = [
      ['is_pos', '=', 1],
      ['docstatus', '=', 0],
    ] as Filter[];
    savedCount.value = await getCount('Books Sales Invoice', filters, []);
  }
});

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
  ];
  return all.filter(({ hidden }) => !hidden);
});

const options = computed<DropdownOptions>(() => {
  const toOption = ({ name, label, icon, count }: MenuAction) => ({
    label,
    icon,
    count,
    onClick: () => emit('select', name),
  });
  const shiftClose: MenuAction = {
    name: 'ShiftClose',
    label: t`Close POS Shift`,
    icon: 'lucide-log-out',
  };

  return [
    {
      key: 'actions',
      group: '',
      hideLabel: true,
      options: actions.value.map(toOption),
    },
    {
      key: 'shift',
      group: '',
      hideLabel: true,
      options: [toOption(shiftClose)],
    },
  ];
});
</script>
