<template>
  <div v-if="showCoupon || showLoyalty || showPriceList" class="flex gap-1.5">
    <FrappeButton
      v-if="showCoupon"
      variant="outline"
      icon-left="lucide-ticket-percent"
      :label="couponLabel"
      @click="$emit('openCouponCode')"
    />
    <FrappeButton
      v-if="showLoyalty"
      variant="outline"
      icon-left="lucide-gift"
      :label="loyaltyLabel"
      @click="$emit('openLoyaltyProgram')"
    />
    <FrappeButton
      v-if="showPriceList"
      variant="outline"
      icon-left="lucide-list-checks"
      :label="sinvDoc.price_list || t`Price list`"
      @click="$emit('openPriceList')"
    />
  </div>
</template>

<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { fyo } from 'src/initFyo';
import { computed, inject, type Ref } from 'vue';

/** Coupon, loyalty and price list actions, each shown when its feature is on. */
const props = defineProps<{
  loyaltyProgram?: string;
  appliedCouponsCount?: number;
}>();
defineEmits<{
  openCouponCode: [];
  openLoyaltyProgram: [];
  openPriceList: [];
}>();

const sinvDoc = inject('sinvDoc') as Ref<SalesInvoice>;
const settings = fyo.singles.AccountingSettings;

const showCoupon = computed(() => !!settings?.enable_coupon_code);
const showLoyalty = computed(
  () => !!settings?.enable_loyalty_program && !!props.loyaltyProgram
);
const showPriceList = computed(() => !!settings?.enable_price_list);

const couponLabel = computed(() => {
  const count = props.appliedCouponsCount ?? 0;
  if (!count) return t`Coupon`;
  return count === 1 ? t`1 coupon applied` : t`${count} coupons applied`;
});
const loyaltyLabel = computed(() => {
  const points = sinvDoc.value.loyalty_points ?? 0;
  return points ? t`${points} points redeemed` : t`Loyalty`;
});
</script>
