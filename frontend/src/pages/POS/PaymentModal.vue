<template>
  <MobilePayment
    v-if="isMobile && openModal"
    :loyalty-points="loyaltyPoints"
    :loyalty-program="loyaltyProgram"
    :applied-coupons-count="appliedCouponsCount"
    @set-loyalty="(on: boolean) => $emit('setLoyalty', on)"
    @apply-coupon="$emit('applyCoupon')"
    @pay="payTransaction"
    @pay-and-print="payAndPrintTransaction"
    @submit="submitTransaction"
  />
  <Modal
    v-else-if="!isMobile"
    :open-modal="openModal"
    :title="paymentTitle"
    :subtitle="paymentSubtitle"
    size="lg"
    @closemodal="cancelTransaction"
  >
    <div v-if="sinvDoc.fieldMap" class="flex flex-col gap-4">
      <PaymentMethodSelector
        :methods="posCheckout.methods"
        :selected="posCheckout.tender.payment_method"
        @select="posCheckout.selectMethod"
      />

      <div class="flex flex-col gap-1.5">
        <Currency
          :df="{
            ...getField('PaymentFor', 'amount')!,
            label: sinvDoc.isReturn ? t`Refund amount` : t`Amount paid`,
          }"
          :show-label="true"
          :read-only="false"
          :border="true"
          :value="posCheckout.tender.amount"
          size="xlarge"
          @change="posCheckout.setAmount"
        />
        <!-- Round cash amounts; other tenders only have the exact one. -->
        <div
          v-if="posCheckout.quickAmounts.length > 1"
          class="flex flex-wrap gap-1.5"
        >
          <FrappeButton
            v-for="amount in posCheckout.quickAmounts"
            :key="amount.float"
            size="xs"
            :variant="
              amount.eq(posCheckout.tender.amount) ? 'subtle' : 'outline'
            "
            :aria-pressed="amount.eq(posCheckout.tender.amount)"
            :label="
              amount.eq(posCheckout.due)
                ? t`Exact`
                : fyo.format(amount, 'Currency')
            "
            @click="posCheckout.setAmount(amount)"
          />
        </div>
      </div>

      <div
        v-if="
          posCheckout.requirements.requiresReferenceId ||
          posCheckout.requirements.requiresClearanceDate
        "
        class="grid grid-cols-2 gap-3"
      >
        <Data
          v-if="posCheckout.requirements.requiresReferenceId"
          :df="getField('Payment', 'reference_id')!"
          :show-label="true"
          :border="true"
          :required="true"
          :read-only="false"
          :value="posCheckout.tender.reference_id"
          :class="
            posCheckout.requirements.requiresClearanceDate ? '' : 'col-span-2'
          "
          @change="(value: string) => (posCheckout.tender.reference_id = value)"
        />

        <DateControl
          v-if="posCheckout.requirements.requiresClearanceDate"
          :df="getField('Payment', 'clearance_date')!"
          :show-label="true"
          :border="true"
          :required="true"
          :read-only="false"
          :value="posCheckout.tender.clearance_date"
          @change="(value: Date) => (posCheckout.tender.clearance_date = value)"
        />
      </div>

      <PaymentSummary :sinv-doc="sinvDoc" />
    </div>

    <template #actions>
      <FrappeButton
        v-if="!sinvDoc.isSubmitted"
        class="me-auto"
        size="md"
        variant="ghost"
        @click="submitTransaction"
      >
        {{ sinvDoc.isReturn ? t`Submit without refund` : t`Submit unpaid` }}
      </FrappeButton>
      <FrappeButton
        v-if="sinvDoc.can('print')"
        size="md"
        icon-left="lucide-printer"
        :disabled="!posCheckout.canPay"
        @click="payAndPrintTransaction"
      >
        {{ sinvDoc.isReturn ? t`Refund and print` : t`Pay and print` }}
      </FrappeButton>
      <FrappeButton
        size="md"
        variant="solid"
        :disabled="!posCheckout.canPay"
        @click="payTransaction"
      >
        {{ sinvDoc.isReturn ? t`Refund` : t`Pay` }}
      </FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import Modal from 'src/components/POS/POSDialog.vue';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import Currency from 'src/components/Controls/Currency.vue';
import Data from 'src/components/Controls/Data.vue';
import DateControl from 'src/components/Controls/Date.vue';
import PaymentMethodSelector from 'src/components/POS/PaymentMethodSelector.vue';
import PaymentSummary from 'src/components/POS/PaymentSummary.vue';
import { getField } from 'src/frappe/registry';
import { posCheckoutKey } from 'src/utils/posCheckout';
import { isMobile } from 'src/utils/viewport';
import MobilePayment from './MobilePayment.vue';
import { Button as FrappeButton } from 'frappe-ui';
import { defineComponent, inject } from 'vue';

export default defineComponent({
  name: 'PaymentModal',
  components: {
    Currency,
    Data,
    DateControl,
    FrappeButton,
    MobilePayment,
    Modal,
    PaymentMethodSelector,
    PaymentSummary,
  },
  props: {
    openModal: Boolean,
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyProgram: { type: String, default: '' },
    appliedCouponsCount: { type: Number, default: 0 },
  },
  emits: ['applyCoupon', 'createTransaction', 'setLoyalty', 'toggleModal'],
  setup() {
    return {
      isMobile,
      posCheckout: inject(posCheckoutKey)!,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
    };
  },
  computed: {
    paymentTitle(): string {
      return this.sinvDoc.isReturn ? this.fyo.t`Refund` : this.fyo.t`Payment`;
    },
    paymentSubtitle(): string {
      const name = this.sinvDoc.inserted ? this.sinvDoc.name : '';
      return [name, this.sinvDoc.party].filter(Boolean).join(' · ');
    },
  },
  watch: {
    openModal(isOpen: boolean) {
      if (isOpen) {
        void this.posCheckout.start();
      }
    },
  },
  methods: {
    getField,
    submitTransaction() {
      this.$emit('createTransaction');
    },
    payTransaction() {
      this.$emit('createTransaction', false, true);
    },
    payAndPrintTransaction() {
      this.$emit('createTransaction', true, true);
    },
    cancelTransaction() {
      this.posCheckout.reset();
      this.$emit('toggleModal', 'Payment');
    },
  },
});
</script>
