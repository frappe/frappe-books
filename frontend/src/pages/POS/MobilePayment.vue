<template>
  <div class="flex flex-1 flex-col">
    <div
      class="flex flex-col items-center gap-1.5 border-b border-outline-gray-1 px-4 pb-5 pt-6 text-center"
    >
      <span class="text-sm text-ink-gray-5">
        {{ sinvDoc.isReturn ? t`Amount to refund` : t`Amount due` }}
      </span>
      <span class="text-7xl-semibold tabular-nums text-ink-gray-9" dir="ltr">
        {{ format(dueAmount) }}
      </span>
      <span class="text-sm text-ink-gray-5">{{ summary }}</span>
      <dl
        v-if="costLines.length > 1"
        class="mt-3 flex w-full flex-col gap-1.5 text-sm tabular-nums text-ink-gray-6"
      >
        <div
          v-for="line in costLines"
          :key="line.label"
          class="flex justify-between gap-4"
        >
          <dt class="min-w-0 text-start">{{ line.label }}</dt>
          <dd class="shrink-0" dir="ltr">{{ format(line.value) }}</dd>
        </div>
      </dl>
    </div>

    <section class="flex flex-col gap-4 p-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-sm text-ink-gray-6">{{ t`Payment method` }}</span>
        <!-- 48px tiles: RadioGroup rows stop at 32px (frappe/frappe-ui#1257). -->
        <div
          role="radiogroup"
          class="grid grid-cols-2 gap-2"
          :aria-label="t`Payment method`"
        >
          <button
            v-for="method in methods"
            :key="method.name"
            type="button"
            role="radio"
            class="flex h-12 min-w-0 items-center gap-2.5 rounded-5 border px-3 text-start text-md-medium"
            :class="
              method.name === paymentMethod
                ? 'border-outline-gray-4 bg-surface-base text-ink-gray-9 shadow-sm'
                : 'border-outline-gray-2 text-ink-gray-7'
            "
            :aria-checked="method.name === paymentMethod"
            @click="$emit('selectMethod', method.name)"
          >
            <FrappeIcon
              :icon="methodIcons[method.type ?? 'Cash']"
              class="size-5 shrink-0"
            />
            <span class="min-w-0 flex-1 truncate">{{ method.name }}</span>
            <FrappeIcon
              v-if="method.name === paymentMethod"
              icon="lucide-circle-check"
              class="size-4 shrink-0 text-ink-gray-9"
            />
          </button>
        </div>
      </div>

      <Data
        v-if="requirements.requiresReferenceId"
        :df="getField('Payment', 'reference_id')!"
        :show-label="true"
        :border="true"
        :required="true"
        :read-only="false"
        :value="transferRefNo"
        @change="(value: string) => $emit('setTransferRefNo', value)"
      />
      <DateControl
        v-if="requirements.requiresClearanceDate"
        :df="getField('Payment', 'clearance_date')!"
        :show-label="true"
        :border="true"
        :required="true"
        :read-only="false"
        :value="transferClearanceDate"
        @change="(value: Date) => $emit('setTransferClearanceDate', value)"
      />

      <Currency
        :df="{
          ...getField('PaymentFor', 'amount')!,
          label: sinvDoc.isReturn ? t`Refund amount` : t`Amount paid`,
        }"
        :show-label="true"
        :read-only="false"
        :border="true"
        :value="paidAmount"
        @change="(amount: Money) => $emit('setPaidAmount', amount)"
      />
      <div class="flex flex-wrap gap-2">
        <FrappeButton
          v-for="amount in quickAmounts"
          :key="amount.float"
          size="lg"
          :variant="amount.eq(paidAmount) ? 'solid' : 'subtle'"
          :label="amount.eq(dueAmount) ? t`Exact` : format(amount)"
          @click="$emit('setPaidAmount', amount)"
        />
      </div>
      <div
        v-if="settlement"
        class="flex justify-between gap-4 py-1 text-lg-semibold tabular-nums text-ink-gray-8"
        role="status"
      >
        <span>{{ settlement.label }}</span>
        <span dir="ltr">{{ format(settlement.amount) }}</span>
      </div>
    </section>

    <section
      v-if="showLoyalty || showCoupon"
      class="border-t border-outline-gray-1"
    >
      <FrappeSwitch
        v-if="showLoyalty"
        class="border-b border-outline-gray-1 px-4 py-3"
        icon="lucide-gift"
        size="md"
        :label="t`Redeem loyalty points`"
        :description="t`${loyaltyPoints} points available`"
        :model-value="!!sinvDoc.redeem_loyalty_points"
        @update:model-value="(on: boolean) => $emit('setLoyalty', on)"
      />
      <!-- A 56px row: ItemListRow stops at 40px (frappe/frappe-ui#1250). -->
      <button
        v-if="showCoupon"
        type="button"
        class="flex h-14 w-full items-center gap-3 border-b border-outline-gray-1 px-4 text-start text-lg text-ink-gray-8"
        @click="$emit('applyCoupon')"
      >
        <FrappeIcon
          icon="lucide-ticket-percent"
          class="size-5 text-ink-gray-5"
        />
        <span class="flex-1">{{ t`Apply coupon code` }}</span>
        <span v-if="appliedCouponsCount" class="text-base text-ink-gray-5">
          {{ appliedCouponsCount }}
        </span>
        <FrappeIcon
          icon="lucide-chevron-right"
          class="size-4 text-ink-gray-4 rtl-rotate-180"
        />
      </button>
    </section>

    <MobileFooter class="flex-col">
      <FrappeButton
        size="lg"
        variant="solid"
        :disabled="payDisabled"
        :label="sinvDoc.isReturn ? t`Refund` : t`Pay`"
        @click="$emit('pay')"
      />
      <div class="flex gap-2">
        <FrappeButton
          class="flex-1"
          size="lg"
          :disabled="payDisabled"
          :label="sinvDoc.isReturn ? t`Refund & print` : t`Pay & print`"
          @click="$emit('payAndPrint')"
        />
        <FrappeButton
          class="flex-1"
          size="lg"
          :label="t`Submit only`"
          @click="$emit('submit')"
        />
      </div>
    </MobileFooter>
  </div>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  Button as FrappeButton,
  Icon as FrappeIcon,
  Switch as FrappeSwitch,
} from 'frappe-ui';
import { PaymentMethodRequirements } from 'models/baseModels/PaymentMethod/requirements';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { PaymentMethodType } from 'models/types';
import { Money } from 'pesa';
import Currency from 'src/components/Controls/Currency.vue';
import Data from 'src/components/Controls/Data.vue';
import DateControl from 'src/components/Controls/Date.vue';
import { PaymentMethodOption } from 'src/components/POS/types';
import { getField } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import {
  getCostLines,
  getQuickPaymentAmounts,
  getTotalQuantity,
} from 'src/utils/pos';
import { computed, inject, type Ref } from 'vue';

/** The phone payment screen; PaymentModal owns its state and checks. */
const props = defineProps<{
  methods: PaymentMethodOption[];
  requirements: PaymentMethodRequirements;
  dueAmount: Money;
  settlement: { label: string; amount: Money } | null;
  payDisabled: boolean;
  loyaltyPoints: number;
  loyaltyProgram: string;
  appliedCouponsCount: number;
}>();

defineEmits<{
  selectMethod: [name: string];
  setPaidAmount: [amount: Money];
  setTransferRefNo: [value: string];
  setTransferClearanceDate: [value: Date];
  setLoyalty: [on: boolean];
  applyCoupon: [];
  pay: [];
  payAndPrint: [];
  submit: [];
}>();

const methodIcons: Record<PaymentMethodType, string> = {
  Cash: 'lucide-banknote',
  Bank: 'lucide-landmark',
  Transfer: 'lucide-arrow-right-left',
};

const sinvDoc = inject('sinvDoc') as Ref<SalesInvoice>;
const paidAmount = inject('paidAmount') as Ref<Money>;
const paymentMethod = inject('paymentMethod') as Ref<string | undefined>;
const transferRefNo = inject('transferRefNo') as Ref<string | undefined>;
const transferClearanceDate = inject('transferClearanceDate') as Ref<
  Date | undefined
>;

const settings = fyo.singles.AccountingSettings;
const showLoyalty = computed(
  () => !!settings?.enable_loyalty_program && !!props.loyaltyProgram
);
const showCoupon = computed(() => !!settings?.enable_coupon_code);

const summary = computed(() => {
  const quantity = getTotalQuantity(sinvDoc.value.items ?? []);
  const items = quantity === 1 ? t`1 item` : t`${quantity} items`;
  return [sinvDoc.value.party, items].filter(Boolean).join(' · ');
});

// Only Net Total means nothing changed it, so the amount due says it all.
const costLines = computed(() => getCostLines(sinvDoc.value));

const quickAmounts = computed(() => {
  if (sinvDoc.value.isReturn || !props.requirements.isCash) {
    return [props.dueAmount];
  }

  const notes = getQuickPaymentAmounts(props.dueAmount.float);
  return [props.dueAmount, ...notes.map((note) => fyo.pesa(note))];
});

function format(amount: Money): string {
  return fyo.format(amount, 'Currency');
}
</script>
