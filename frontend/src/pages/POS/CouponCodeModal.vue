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

      <div v-if="appliedCoupons.length" class="flex flex-col gap-1.5">
        <p class="text-sm text-ink-gray-5">{{ t`Applied` }}</p>
        <div v-if="isMobile" class="flex flex-wrap gap-2">
          <span
            v-for="coupon in appliedCoupons as AppliedCouponCode[]"
            :key="coupon.coupons"
            class="flex h-8 items-center gap-1 rounded-full bg-surface-gray-2 pe-1 ps-3 text-sm-medium text-ink-gray-8"
          >
            {{ coupon.coupons }}
            <FrappeButton
              icon="lucide-x"
              variant="ghost"
              size="sm"
              :aria-label="t`Remove coupon`"
              @click="removeAppliedCoupon(coupon)"
            />
          </span>
        </div>
        <ul
          v-else
          class="max-h-40 divide-y divide-outline-gray-1 overflow-y-auto rounded-4 border border-outline-gray-1"
        >
          <li
            v-for="coupon in appliedCoupons as AppliedCouponCode[]"
            :key="coupon.coupons"
            class="flex items-center gap-2.5 px-3 py-2.5"
          >
            <span
              class="lucide-ticket-percent size-4 shrink-0 text-ink-green-5"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-base-medium text-ink-gray-9">
              {{ coupon.coupons }}
            </span>
            <FrappeButton
              icon="lucide-x"
              variant="ghost"
              size="xs"
              :tooltip="t`Remove coupon`"
              :aria-label="t`Remove coupon`"
              @click="removeAppliedCoupon(coupon)"
            />
          </li>
        </ul>
      </div>
    </div>
    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="cancelApplyCouponCode">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="setCouponCode"
        >{{ t`Done` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import Modal from 'src/components/POS/POSDialog.vue';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { defineComponent, inject } from 'vue';
import type { AppliedCouponCode } from 'models/invoices/AppliedCouponCode';
import { getField } from 'src/frappe/registry';
import Link from 'src/components/Controls/Link.vue';
import { Field } from 'schemas/types';
import {
  Button as FrappeButton,
  ErrorMessage as FrappeErrorMessage,
} from 'frappe-ui';
import { getErrorMessage } from 'src/utils';
import { isMobile } from 'src/utils/viewport';

export default defineComponent({
  name: 'CouponCodeModal',
  components: {
    Modal,
    Link,
    FrappeButton,
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
      appliedCoupons: inject('appliedCoupons') as AppliedCouponCode[],
    };
  },
  data() {
    return {
      errorMessage: '',
      couponCode: '',
      initialCouponCodes: [] as string[],
    };
  },
  computed: {
    couponField(): Field | undefined {
      return getField('AppliedCouponCodes', 'coupons');
    },
    subtitle(): string {
      const name = this.sinvDoc.inserted ? this.sinvDoc.name : '';
      return [this.sinvDoc.party, name].filter(Boolean).join(' · ');
    },
  },
  watch: {
    openModal(value: boolean) {
      if (!value) {
        return;
      }

      this.couponCode = '';
      this.errorMessage = '';
      this.initialCouponCodes =
        this.sinvDoc.coupons?.map((coupon) => coupon.coupons ?? '') ?? [];
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
        await this.applyCoupon(this.couponCode);
        this.couponCode = '';
      } catch (error) {
        this.errorMessage = getErrorMessage(error as Error);
      }
    },
    /** The server's preview says why a coupon does not apply, which is then taken off. */
    async applyCoupon(coupon: string) {
      await this.sinvDoc.append('coupons', { coupons: coupon });
      try {
        await this.sinvDoc.preview({ check_coupons: true });
      } catch (error) {
        const added = this.sinvDoc.coupons?.at(-1);
        await this.sinvDoc.remove('coupons', added?.idx as number);
        throw error;
      }
    },
    setCouponCode() {
      this.$emit('toggleModal', 'CouponCode');
    },
    async removeAppliedCoupon(coupon: AppliedCouponCode) {
      await coupon?.parentdoc?.remove('coupons', coupon.idx as number);
    },
    async cancelApplyCouponCode() {
      this.couponCode = '';
      await this.sinvDoc.set('coupons', null);

      for (const coupons of this.initialCouponCodes) {
        await this.sinvDoc.append('coupons', { coupons });
      }

      this.$emit('toggleModal', 'CouponCode');
    },
  },
});
</script>
