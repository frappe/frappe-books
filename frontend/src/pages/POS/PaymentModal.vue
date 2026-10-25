<template>
  <MobilePayment
    v-if="isMobile && openModal"
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
      <div
        v-for="(tender, index) in posCheckout.tenders"
        :key="index"
        class="flex flex-col gap-4"
        :class="{ 'border-t border-outline-gray-1 pt-4': index }"
      >
        <PaymentMethodSelector
          :methods="posCheckout.getMethods(index)"
          :selected="tender.mode_of_payment"
          :label="getTenderLabel(index)"
          :removable="isSplit"
          @select="(name: string) => posCheckout.selectMethod(index, name)"
          @remove="posCheckout.removeTender(index)"
        />

        <div class="flex flex-col gap-1.5">
          <Currency
            :df="amountField"
            :show-label="true"
            :read-only="false"
            :border="true"
            :value="tender.amount"
            size="xlarge"
            @change="posCheckout.setAmount(index, $event)"
          />
          <!-- Round cash amounts; other tenders only have the exact one. -->
          <div
            v-if="posCheckout.getQuickAmounts(index).length > 1"
            class="flex flex-wrap gap-1.5"
          >
            <FrappeButton
              v-for="amount in posCheckout.getQuickAmounts(index)"
              :key="amount.float"
              size="xs"
              :variant="amount.eq(tender.amount) ? 'subtle' : 'outline'"
              :aria-pressed="amount.eq(tender.amount)"
              :label="
                amount.eq(posCheckout.getRest(index))
                  ? t`Exact`
                  : fyo.format(amount, 'Currency')
              "
              @click="posCheckout.setAmount(index, amount)"
            />
          </div>
        </div>

        <div
          v-if="
            posCheckout.getRequirements(index).requiresReferenceId ||
            posCheckout.getRequirements(index).requiresClearanceDate
          "
          class="grid grid-cols-2 gap-3"
        >
          <Data
            v-if="posCheckout.getRequirements(index).requiresReferenceId"
            :df="getField('PaymentEntry', 'reference_no')!"
            :show-label="true"
            :border="true"
            :required="true"
            :read-only="false"
            :value="tender.reference_no"
            :class="
              posCheckout.getRequirements(index).requiresClearanceDate
                ? ''
                : 'col-span-2'
            "
            @change="
              (reference: string) => posCheckout.setReference(index, reference)
            "
          />

          <DateControl
            v-if="posCheckout.getRequirements(index).requiresClearanceDate"
            :df="getField('PaymentEntry', 'clearance_date')!"
            :show-label="true"
            :border="true"
            :required="true"
            :read-only="false"
            :value="tender.clearance_date"
            @change="(date: Date) => posCheckout.setClearanceDate(index, date)"
          />
        </div>
      </div>

      <FrappeButton
        v-if="posCheckout.canAddTender"
        class="self-start"
        icon-left="lucide-plus"
        size="md"
        variant="ghost"
        @click="posCheckout.addTender"
      >
        {{ t`Add payment` }}
      </FrappeButton>

      <PaymentSummary
        :sinv-doc="sinvDoc"
        :settlement="posCheckout.settlement"
      />
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
import type { Field } from 'schemas/types';
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
    isSplit(): boolean {
      return this.posCheckout.tenders.length > 1;
    },
    amountField(): Field {
      return {
        ...getField('PaymentEntryReference', 'allocated_amount')!,
        label: this.sinvDoc.isReturn
          ? this.fyo.t`Refund amount`
          : this.fyo.t`Amount paid`,
      };
    },
    paymentTitle(): string {
      return this.sinvDoc.isReturn ? this.fyo.t`Refund` : this.fyo.t`Payment`;
    },
    paymentSubtitle(): string {
      const name = this.sinvDoc.inserted ? this.sinvDoc.name : '';
      return [name, this.sinvDoc.customer].filter(Boolean).join(' · ');
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
    getTenderLabel(index: number): string | undefined {
      return this.isSplit ? this.fyo.t`Payment ${index + 1}` : undefined;
    },
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
