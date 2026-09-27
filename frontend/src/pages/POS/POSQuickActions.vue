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
    v-if="fyo.singles.AccountingSettings?.enableLoyaltyProgram && loyaltyProgram"
    icon="lucide-badge-dollar-sign"
    :tooltip="t`Loyalty Program`"
    variant="subtle"
    :aria-label="t`Loyalty Program`"
    @click="openLoyaltyModal"
  />

  <div v-if="fyo.singles.AccountingSettings?.enableCouponCode" class="relative">
    <FrappeButton
      icon="lucide-ticket-percent"
      :tooltip="t`Coupon Code`"
      variant="subtle"
      :aria-label="t`Coupon Code`"
      @click="openCouponModal"
    />
    <FrappeBadge
      v-if="appliedCouponsCount"
      theme="green"
      class="pointer-events-none absolute -end-2 -top-2 !min-w-5 justify-center"
    >
      {{ appliedCouponsCount }}
    </FrappeBadge>
  </div>

  <FrappeButton
    v-if="fyo.singles.AccountingSettings?.enablePriceList"
    icon="lucide-list-checks"
    :tooltip="t`Price List`"
    variant="subtle"
    :aria-label="t`Price List`"
    @click="$emit('toggleModal', 'PriceList', true)"
  />

  <FrappeButton
    v-if="fyo.singles.AccountingSettings?.enableItemEnquiry"
    icon="lucide-square-pen"
    :tooltip="t`Item Enquiry`"
    variant="subtle"
    :aria-label="t`Item Enquiry`"
    @click="$emit('toggleModal', 'ItemEnquiry', true)"
  />
</template>

<script lang="ts">
import { t } from 'fyo';
import { Badge as FrappeBadge, Button as FrappeButton } from 'frappe-ui';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { showToast } from 'src/utils/interactive';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'POSQuickActions',
  components: { FrappeBadge, FrappeButton },
  props: {
    tableView: Boolean,
    loyaltyPoints: {
      type: Number,
      default: 0,
    },
    loyaltyProgram: {
      type: String,
      default: '',
    },
    appliedCouponsCount: {
      type: Number,
      default: 0,
    },
    sinvDoc: {
      type: Object as PropType<SalesInvoice | undefined>,
      default: undefined,
    },
  },
  emits: ['toggleView', 'toggleModal', 'emitRouteToSinvList'],
  methods: {
    showValidationToast(action: string, isLoyalty = false) {
      let message = '';

      if (!this.sinvDoc?.items?.length) {
        message = t`Please add items`;
      } else if (!this.sinvDoc?.party) {
        message = t`Please select a customer`;
      } else if (isLoyalty && !this.loyaltyPoints) {
        message = t`Customer has no loyalty points to redeem`;
      }

      showToast({
        type: 'error',
        message: t`${message} before ${action}`,
      });
    },
    openCouponModal() {
      if (!this.sinvDoc?.items?.length || !this.sinvDoc?.party) {
        this.showValidationToast('applying coupon');
        return;
      }
      this.$emit('toggleModal', 'CouponCode', true);
    },
    openLoyaltyModal() {
      if (!this.sinvDoc?.items?.length || !this.sinvDoc?.party || !this.loyaltyPoints) {
        this.showValidationToast('applying loyalty points', true);
        return;
      }
      this.$emit('toggleModal', 'LoyaltyProgram', true);
    },
  },
});
</script>
