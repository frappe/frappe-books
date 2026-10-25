<template>
  <Modal
    :open-modal="openModal"
    :title="t`Coupon code`"
    :subtitle="subtitle"
    size="md"
    @closemodal="cancelApplyCouponCode"
  >
    <div class="flex flex-col gap-4">
      <div v-if="couponField" class="flex flex-col gap-1.5">
        <Link
          class="w-full min-w-0"
          :show-label="isMobile"
          :border="true"
          :value="couponCode"
          :focus-input="!isMobile"
          :invalid="Boolean(errorMessage)"
          :df="couponField"
          @change="updateCouponCode"
        />
        <FrappeErrorMessage :message="errorMessage" />
      </div>

      <div v-if="appliedCoupon" class="flex flex-col gap-1.5">
        <p class="text-sm text-ink-gray-5">{{ t`Applied` }}</p>
        <!-- MobileFilterChip's shape; its name says "filter". -->
        <div v-if="isMobile" class="flex flex-wrap gap-2">
          <MobileFilterChip
            :value="appliedCoupon"
            :remove-label="t`Remove coupon ${appliedCoupon}`"
            @click="removeAppliedCoupon"
          />
        </div>
        <div v-else class="rounded-6 border border-outline-gray-1">
          <div class="flex items-center gap-2.5 px-3 py-2.5">
            <span
              class="lucide-ticket-percent size-4 shrink-0 text-ink-green-5"
              aria-hidden="true"
            />
            <span
              class="min-w-0 flex-1 truncate text-base-medium text-ink-gray-8"
            >
              {{ appliedCoupon }}
            </span>
            <FrappeButton
              icon="lucide-x"
              variant="ghost"
              size="xs"
              :tooltip="t`Remove coupon`"
              :aria-label="t`Remove coupon`"
              @click="removeAppliedCoupon"
            />
          </div>
        </div>
      </div>
    </div>
    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        @click="cancelApplyCouponCode"
        >{{ t`Cancel` }}</FrappeButton
      >
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="setCouponCode"
        >{{ t`Done` }}</FrappeButton
      >
    </template>
  </Modal>
</template>

<script lang="ts">
import Modal from 'src/components/POS/POSDialog.vue';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { defineComponent, inject } from 'vue';
import { getField } from 'src/frappe/registry';
import Link from 'src/components/Controls/Link.vue';
import MobileFilterChip from 'src/mobile/MobileFilterChip.vue';
import { Field } from 'schemas/types';
import {
  Button as FrappeButton,
  ErrorMessage as FrappeErrorMessage,
} from 'frappe-ui';
import { getErrorMessage } from 'src/utils';
import { getCouponName } from 'src/utils/posDiscounts';
import { isMobile } from 'src/utils/viewport';

export default defineComponent({
  name: 'CouponCodeModal',
  components: {
    Modal,
    Link,
    FrappeButton,
    MobileFilterChip,
    FrappeErrorMessage,
  },
  props: {
    openModal: Boolean,
  },
  emits: ['toggleModal'],

  setup() {
    return {
      isMobile,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
      appliedCoupon: inject('appliedCoupon') as string | undefined,
    };
  },
  data() {
    return {
      errorMessage: '',
      couponCode: '',
      initialCouponCode: undefined as string | undefined,
    };
  },
  computed: {
    couponField(): Field | undefined {
      return getField('SalesInvoice', 'coupon_code');
    },
    subtitle(): string {
      const name = this.sinvDoc.inserted ? this.sinvDoc.name : '';
      return [this.sinvDoc.customer, name].filter(Boolean).join(' · ');
    },
  },
  watch: {
    openModal(value: boolean) {
      if (!value) {
        return;
      }

      this.couponCode = '';
      this.errorMessage = '';
      this.initialCouponCode = this.sinvDoc.coupon_code;
    },
  },
  methods: {
    async updateCouponCode(value: string | Event) {
      try {
        if (!value) {
          return;
        }
        this.errorMessage = '';

        if ((value as Event).type === 'keydown') {
          value = ((value as Event).target as HTMLInputElement).value;
        }

        this.couponCode = value as string;
        await this.applyCoupon(await getCouponName(this.couponCode));
        this.couponCode = '';
      } catch (error) {
        this.errorMessage = getErrorMessage(error as Error);
      }
    },
    /**
     * A sale takes one coupon, so a new one replaces it. The server's preview
     * says why a coupon does not apply, which then gives way to the one before.
     */
    async applyCoupon(coupon: string) {
      const previous = this.sinvDoc.coupon_code;
      await this.sinvDoc.set('coupon_code', coupon);
      try {
        await this.sinvDoc.preview({ check_coupons: true });
      } catch (error) {
        await this.sinvDoc.set('coupon_code', previous ?? null);
        throw error;
      }
    },
    setCouponCode() {
      this.$emit('toggleModal', 'CouponCode');
    },
    async removeAppliedCoupon() {
      await this.sinvDoc.set('coupon_code', null);
    },
    async cancelApplyCouponCode() {
      this.couponCode = '';
      await this.sinvDoc.set('coupon_code', this.initialCouponCode ?? null);
      this.$emit('toggleModal', 'CouponCode');
    },
  },
});
</script>
