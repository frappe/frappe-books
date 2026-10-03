<template>
  <div
    v-if="showCoupon || showLoyalty || showPriceList"
    class="flex flex-wrap gap-1.5"
  >
    <FrappeButton
      v-if="showCoupon"
      icon-left="lucide-ticket-percent"
      :label="couponLabel"
      @click="$emit('openCouponCode')"
    />
    <FrappeButton
      v-if="showLoyalty"
      icon-left="lucide-gift"
      :label="loyaltyLabel"
      @click="$emit('openLoyaltyProgram')"
    />
    <FrappeButton
      v-if="showPriceList"
      class="max-w-full"
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
import {
  isCouponOffered,
  isLoyaltyOffered,
  isPriceListOffered,
} from 'src/utils/posDiscounts';
import { computed, inject, type Ref } from 'vue';

/** Coupon, loyalty and price list actions, each shown when the POS offers it on the sale. */
const props = defineProps<{ appliedCouponsCount?: number }>();
defineEmits<{
  openCouponCode: [];
  openLoyaltyProgram: [];
  openPriceList: [];
}>();

const sinvDoc = inject('sinvDoc') as Ref<SalesInvoice>;

const showCoupon = computed(() => isCouponOffered(sinvDoc.value));
const showLoyalty = computed(() => isLoyaltyOffered(sinvDoc.value));
const showPriceList = computed(() => isPriceListOffered(sinvDoc.value));

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
