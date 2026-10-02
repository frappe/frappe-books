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
    size="2xl"
    @closemodal="cancelTransaction"
  >
    <div
      v-if="sinvDoc.fieldMap"
      class="grid items-start gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
    >
      <PaymentSummary
        class="order-2 md:order-1"
        :sinv-doc="sinvDoc"
      />

      <section class="order-1 min-w-0 space-y-5 md:order-2" aria-label="Payment details">
        <Currency
          :df="{
            ...getField('PaymentFor', 'amount')!,
            label: sinvDoc.isReturn ? t`Refund amount` : t`Paid amount`,
          }"
          :show-label="true"
          :read-only="false"
          :border="true"
          :text-right="true"
          :value="paidAmount"
          size="large"
          @change="(amount: Money) => $emit('setPaidAmount', amount)"
        />

        <PaymentMethodSelector
          :methods="paymentMethodNames"
          :selected="paymentMethod"
          @select="setPaymentMethodAndAmount"
        />

        <div v-if="showReferenceField || showClearanceDate">
          <div class="grid gap-4 sm:grid-cols-2">
            <Data
              v-if="showReferenceField"
              :df="getField('Payment', 'reference_id')!"
              :show-label="true"
              :border="true"
              :required="true"
              :read-only="false"
              :value="transferRefNo"
              :class="showClearanceDate ? '' : 'sm:col-span-2'"
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
              @change="
                (value: Date) => $emit('setTransferClearanceDate', value)
              "
            />
          </div>
        </div>

        <div
          v-if="showSettlementAmount"
          class="flex items-center justify-between gap-4 rounded-6 px-3 py-2.5"
          :class="settlementClasses"
          role="status"
        >
          <span class="text-sm-medium">{{ settlementLabel }}</span>
          <span class="text-lg-semibold tabular-nums">
            {{ fyo.format(settlementAmount, 'Currency') }}
          </span>
        </div>
      </section>
    </div>

    <template #actions>
      <div
        class="flex w-full flex-wrap items-center justify-between gap-2"
      >
        <FrappeButton
          size="md"
          theme="gray"
          variant="ghost"
          @click="cancelTransaction"
        >
          {{ t`Cancel` }}
        </FrappeButton>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <FrappeButton
            size="md"
            theme="gray"
            variant="subtle"
            @click="submitTransaction"
          >
            {{ t`Submit only` }}
          </FrappeButton>
          <FrappeButton
            v-if="sinvDoc.can('print')"
            size="md"
            theme="gray"
            variant="subtle"
            :disabled="isPayDisabled"
            @click="payAndPrintTransaction"
          >
            {{ sinvDoc.isReturn ? t`Refund & print` : t`Pay & print` }}
          </FrappeButton>
          <FrappeButton
            size="md"
            theme="gray"
            variant="solid"
            :disabled="isPayDisabled"
            @click="payTransaction"
          >
            {{ sinvDoc.isReturn ? t`Refund` : t`Pay` }}
          </FrappeButton>
        </div>
      </div>
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
      return this.sinvDoc.isReturn
        ? this.fyo.t`Complete refund`
        : this.fyo.t`Complete payment`;
    },
    isPaymentMethodCash(): boolean {
      return this.paymentRequirements.isCash;
    },
    paymentMethodNames(): string[] {
      return this.paymentMethods.map(({ name }) => name);
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
        ? this.fyo.t`Change due`
        : this.fyo.t`Balance due`;
    },
    settlementClasses(): string {
      return this.showPaidChange
        ? 'bg-surface-green-2 text-ink-green-7'
        : 'bg-surface-amber-2 text-ink-amber-7';
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
