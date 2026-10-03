<template>
  <FrappeButton
    :icon="tableView ? 'lucide-grid-2x2' : 'lucide-list'"
    :tooltip="tableView ? t`Grid View` : t`List View`"
    variant="subtle"
    :aria-label="tableView ? t`Grid View` : t`List View`"
    @click="$emit('toggleView')"
  />

  <FrappeButton
    icon="lucide-receipt-text"
    :tooltip="t`Sales Invoice List`"
    variant="subtle"
    :aria-label="t`Sales Invoice List`"
    @click="$emit('emitRouteToSinvList')"
  />

  <FrappeButton
    v-if="fyo.singles.AccountingSettings?.enable_loyalty_program && loyaltyProgram"
    icon="lucide-badge-dollar-sign"
    :tooltip="t`Loyalty Program`"
    variant="subtle"
    :aria-label="t`Loyalty Program`"
    @click="$emit('openLoyaltyProgram')"
  />

  <div v-if="fyo.singles.AccountingSettings?.enable_coupon_code" class="relative">
    <FrappeButton
      icon="lucide-ticket-percent"
      :tooltip="t`Coupon Code`"
      variant="subtle"
      :aria-label="t`Coupon Code`"
      @click="$emit('openCouponCode')"
    />
    <FrappeBadge
      v-if="appliedCouponsCount"
      theme="green"
      class="pointer-events-none absolute -end-2 -top-2 min-w-5 justify-center"
    >
      {{ appliedCouponsCount }}
    </FrappeBadge>
  </div>

  <FrappeButton
    v-if="fyo.singles.AccountingSettings?.enable_price_list"
    icon="lucide-list-checks"
    :tooltip="t`Price List`"
    variant="subtle"
    :aria-label="t`Price List`"
    @click="$emit('toggleModal', 'PriceList', true)"
  />

  <FrappeButton
    v-if="fyo.singles.AccountingSettings?.enable_item_enquiry"
    icon="lucide-square-pen"
    :tooltip="t`Item Enquiry`"
    variant="subtle"
    :aria-label="t`Item Enquiry`"
    @click="$emit('toggleModal', 'ItemEnquiry', true)"
  />
</template>

<script lang="ts">
import { Badge as FrappeBadge, Button as FrappeButton } from 'frappe-ui';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'POSQuickActions',
  components: { FrappeBadge, FrappeButton },
  props: {
    tableView: Boolean,
    loyaltyProgram: {
      type: String,
      default: '',
    },
    appliedCouponsCount: {
      type: Number,
      default: 0,
    },
  },
  emits: [
    'toggleView',
    'toggleModal',
    'emitRouteToSinvList',
    'openLoyaltyProgram',
    'openCouponCode',
  ],
});
</script>
