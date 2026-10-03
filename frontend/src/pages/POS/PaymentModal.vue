<template>
  <MobilePayment
    v-if="isMobile && openModal"
    :methods="paymentMethods"
    :requirements="paymentRequirements"
    :due-amount="getDefaultPaymentAmount()"
    :settlement="
      showSettlementAmount
        ? { label: settlementLabel, amount: settlementAmount }
        : null
    "
    :pay-disabled="isPayDisabled"
    :loyalty-points="loyaltyPoints"
    :loyalty-program="loyaltyProgram"
    :applied-coupons-count="appliedCouponsCount"
    @select-method="setPaymentMethodAndAmount"
    @set-paid-amount="(amount: Money) => $emit('setPaidAmount', amount)"
    @set-transfer-ref-no="(value: string) => $emit('setTransferRefNo', value)"
    @set-transfer-clearance-date="
      (value: Date) => $emit('setTransferClearanceDate', value)
    "
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
        :methods="paymentMethods"
        :selected="paymentMethod"
        @select="setPaymentMethodAndAmount"
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
          :value="paidAmount"
          size="xlarge"
          @change="(amount: Money) => $emit('setPaidAmount', amount)"
        />
        <div v-if="isCashSale" class="flex flex-wrap gap-1.5">
          <FrappeButton
            v-for="amount in quickAmounts"
            :key="amount.float"
            size="xs"
            :variant="amount.eq(paidAmount) ? 'solid' : 'subtle'"
            :label="amount.eq(dueAmount) ? t`Exact` : fyo.format(amount, 'Currency')"
            @click="$emit('setPaidAmount', amount)"
          />
        </div>
      </div>

      <div
        v-if="showReferenceField || showClearanceDate"
        class="grid grid-cols-2 gap-3"
      >
        <Data
          v-if="showReferenceField"
          :df="getField('Payment', 'reference_id')!"
          :show-label="true"
          :border="true"
          :required="true"
          :read-only="false"
          :value="transferRefNo"
          :class="showClearanceDate ? '' : 'col-span-2'"
          @change="(value: string) => $emit('setTransferRefNo', value)"
        />

        <DateControl
          v-if="showClearanceDate"
          :df="getField('Payment', 'clearance_date')!"
          :show-label="true"
          :border="true"
          :required="true"
          :read-only="false"
          :value="transferClearanceDate"
          @change="(value: Date) => $emit('setTransferClearanceDate', value)"
        />
      </div>

      <PaymentSummary
        :sinv-doc="sinvDoc"
        :settlement="
          showSettlementAmount
            ? {
                label: settlementLabel,
                amount: settlementAmount,
                isChange: showPaidChange,
              }
            : null
        "
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
        :disabled="isPayDisabled"
        @click="payAndPrintTransaction"
      >
        {{ sinvDoc.isReturn ? t`Refund and print` : t`Pay and print` }}
      </FrappeButton>
      <FrappeButton
        size="md"
        variant="solid"
        :disabled="isPayDisabled"
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
import {
  getPaymentMethodRequirements,
  PaymentMethodRequirements,
} from 'models/baseModels/PaymentMethod/requirements';
import { Money } from 'pesa';
import Currency from 'src/components/Controls/Currency.vue';
import Data from 'src/components/Controls/Data.vue';
import DateControl from 'src/components/Controls/Date.vue';
import PaymentMethodSelector from 'src/components/POS/PaymentMethodSelector.vue';
import PaymentSummary from 'src/components/POS/PaymentSummary.vue';
import { PaymentMethodOption } from 'src/components/POS/types';
import { getAllDocuments } from 'src/frappe/api';
import { getField } from 'src/frappe/registry';
import { getPaymentShortcuts } from 'src/utils/pos';
import { isMobile } from 'src/utils/viewport';
import MobilePayment from './MobilePayment.vue';
import { fyo } from 'src/initFyo';
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
  emits: [
    'applyCoupon',
    'createTransaction',
    'setLoyalty',
    'setPaidAmount',
    'setPaymentMethod',
    'setTransferClearanceDate',
    'setTransferRefNo',
    'toggleModal',
  ],
  setup() {
    return {
      isMobile,
      paidAmount: inject('paidAmount') as Money,
      paymentMethod: inject('paymentMethod') as string,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
      transferRefNo: inject('transferRefNo') as string,
      transferClearanceDate: inject('transferClearanceDate') as Date,
    };
  },
  data() {
    return {
      paymentMethods: [] as PaymentMethodOption[],
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
    dueAmount(): Money {
      return this.getDefaultPaymentAmount();
    },
    isCashSale(): boolean {
      return !this.sinvDoc.isReturn && this.isPaymentMethodCash;
    },
    quickAmounts(): Money[] {
      return getPaymentShortcuts(this.dueAmount, this.isCashSale);
    },
    isPaymentMethodCash(): boolean {
      return this.paymentRequirements.isCash;
    },
    paymentRequirements(): PaymentMethodRequirements {
      const selectedMethod = this.paymentMethods.find(
        ({ name }) => name === this.paymentMethod
      );
      return getPaymentMethodRequirements(
        selectedMethod?.type,
        selectedMethod?.requires_clearance_date
      );
    },
    showReferenceField(): boolean {
      return this.paymentRequirements.requiresReferenceId;
    },
    showClearanceDate(): boolean {
      return this.paymentRequirements.requiresClearanceDate;
    },
    balanceAmount(): Money {
      return (this.sinvDoc.grand_total ?? fyo.pesa(0)).sub(this.paidAmount);
    },
    paidChange(): Money {
      return this.paidAmount.sub(this.sinvDoc.grand_total ?? fyo.pesa(0));
    },
    showBalanceAmount(): boolean {
      return this.paidAmount.float > 0 && this.balanceAmount.isPositive();
    },
    showPaidChange(): boolean {
      return Boolean(
        !this.sinvDoc.isReturn &&
        this.isPaymentMethodCash &&
        this.paidChange.isPositive()
      );
    },
    showSettlementAmount(): boolean {
      return this.showBalanceAmount || this.showPaidChange;
    },
    settlementAmount(): Money {
      return this.showPaidChange ? this.paidChange : this.balanceAmount;
    },
    settlementLabel(): string {
      return this.showPaidChange
        ? this.fyo.t`Change to return`
        : this.fyo.t`Balance due`;
    },
    isPayDisabled(): boolean {
      if (!this.paymentMethod || this.paidAmount.float <= 0) {
        return true;
      }

      return Boolean(
        (this.showReferenceField && !this.transferRefNo) ||
        (this.showClearanceDate && !this.transferClearanceDate)
      );
    },
  },
  watch: {
    openModal(isOpen: boolean) {
      if (isOpen) {
        void this.initializePayment();
      }
    },
  },
  methods: {
    getField,
    async initializePayment() {
      this.$emit('setPaidAmount', this.getDefaultPaymentAmount());
      await this.setPaymentMethods();
    },
    getDefaultPaymentAmount(): Money {
      const outstandingAmount =
        this.sinvDoc.outstanding_amount ?? this.fyo.pesa(0);
      const grandTotal = this.sinvDoc.grand_total ?? this.fyo.pesa(0);

      return (
        outstandingAmount.isZero() ? grandTotal : outstandingAmount
      ).abs();
    },
    setPaymentMethodAndAmount(paymentMethod?: string) {
      if (!paymentMethod) {
        return;
      }

      this.$emit('setPaymentMethod', paymentMethod);
      this.$emit('setPaidAmount', this.getDefaultPaymentAmount());

      const selectedMethod = this.paymentMethods.find(
        ({ name }) => name === paymentMethod
      );
      const requirements = getPaymentMethodRequirements(
        selectedMethod?.type,
        selectedMethod?.requires_clearance_date
      );
      if (requirements.isCash) {
        this.$emit('setTransferRefNo', '');
        this.$emit('setTransferClearanceDate', undefined);
      } else if (!requirements.requiresClearanceDate) {
        this.$emit('setTransferClearanceDate', undefined);
      }
    },
    async setPaymentMethods() {
      this.paymentMethods = (await getAllDocuments('Books Payment Method', {
        fields: ['name', 'type', 'requires_clearance_date'],
      })) as PaymentMethodOption[];
    },
    submitTransaction() {
      this.$emit('createTransaction');
    },
    /** POS checks the payment details before it takes the payment. */
    payTransaction() {
      this.$emit('createTransaction', false, true);
    },
    payAndPrintTransaction() {
      this.$emit('createTransaction', true, true);
    },
    cancelTransaction() {
      this.$emit('setPaidAmount', fyo.pesa(0));
      this.$emit('setPaymentMethod', undefined);
      this.$emit('setTransferRefNo', '');
      this.$emit('setTransferClearanceDate', undefined);
      this.$emit('toggleModal', 'Payment');
    },
  },
});
</script>
