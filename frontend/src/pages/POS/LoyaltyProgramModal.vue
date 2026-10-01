<template>
  <Modal
    :open-modal="openModal"
    :title="t`Redeem Loyalty Points`"
    @closemodal="cancelLoyaltyProgram"
  >
    <div class="flex flex-col gap-5">
      <div class="flex items-start gap-3">
        <span
          class="lucide-coins mt-1 size-5 shrink-0 text-ink-gray-6"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <p class="text-base font-medium text-ink-gray-9">
            {{ t`${loyaltyPoints} points available` }}
          </p>
          <p class="break-words text-sm text-ink-gray-6">
            {{ loyaltyProgram }}
          </p>
        </div>
      </div>
      <Int
        v-if="sinvDoc.fieldMap"
        :show-label="true"
        :border="true"
        :focus-input="!isMobile"
        :value="pendingLoyaltyPoints"
        :df="sinvDoc.fieldMap.loyalty_points"
        @keydown.enter="saveLoyaltyPoints"
        @change="setPendingLoyaltyPoints"
      />
    </div>
    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="cancelLoyaltyProgram">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="saveLoyaltyPoints"
        >{{ t`Save` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';
import Modal from 'src/components/POS/POSDialog.vue';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { defineComponent, inject } from 'vue';
import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import Int from 'src/components/Controls/Int.vue';

export default defineComponent({
  name: 'LoyaltyProgramModal',
  components: {
    Modal,
    FrappeButton,
    Int,
  },
  props: {
    openModal: {
      type: Boolean,
      default: false,
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
    },

    loyaltyProgram: {
      type: String,
      default: '',
    },
  },
  emits: ['setLoyaltyPoints', 'toggleModal'],
  setup() {
    return {
      isMobile,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
    };
  },
  data() {
    return {
      validationError: false,
      initialLoyaltyPoints: 0,
      pendingLoyaltyPoints: 0,
    };
  },
  watch: {
    openModal(value: boolean) {
      if (!value) {
        return;
      }

      this.initialLoyaltyPoints = this.sinvDoc.loyalty_points ?? 0;
      this.pendingLoyaltyPoints = this.initialLoyaltyPoints;
      this.validationError = false;
    },
  },
  methods: {
    setPendingLoyaltyPoints(value: number) {
      this.pendingLoyaltyPoints = value;
      this.validationError = false;
    },
    cancelLoyaltyProgram() {
      this.$emit('setLoyaltyPoints', this.initialLoyaltyPoints);
      this.$emit('toggleModal', 'LoyaltyProgram', false);
    },
    /** The server checks the points against the customer's balance and the invoice total. */
    applyLoyaltyPoints(newValue: number): boolean {
      if (newValue < 0) {
        this.validationError = true;
        showToast({ type: 'error', message: t`Points must be greater than 0` });
        return false;
      }

      this.$emit('setLoyaltyPoints', newValue);
      this.validationError = false;
      return true;
    },
    saveLoyaltyPoints() {
      const applied = this.applyLoyaltyPoints(this.pendingLoyaltyPoints);

      if (applied) {
        this.$emit('toggleModal', 'LoyaltyProgram', false);
      }
    },
  },
});
</script>
