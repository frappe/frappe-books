<template>
  <Modal
    :open-modal="openModal"
    :title="t`Apply Coupon Code`"
    @closemodal="cancelApplyCouponCode"
  >
    <div class="flex flex-col gap-4">
      <p
        v-if="appliedCoupons.length"
        class="text-sm-medium text-ink-gray-7"
      >
        {{ t`Applied Coupon Codes` }}
      </p>
      <div
        v-if="appliedCoupons.length && isMobile"
        class="-mt-2 flex flex-wrap gap-2"
      >
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
      <FrappeList
        v-else-if="appliedCoupons.length"
        :columns="['minmax(0, 1fr)', '2rem']"
        divider="full"
        class="max-h-40 overflow-y-auto rounded-4 border border-outline-gray-1"
      >
        <FrappeListRows
          :items="appliedCoupons as AppliedCouponCode[]"
          row-key="coupons"
        >
          <template #default="{ item: coupon, value }">
            <FrappeListRow
              :value="value"
              class="min-h-10 px-3 hover:bg-surface-gray-1"
            >
              <FrappeListCell>
                <FormControl
                  v-for="df in tableFields"
                  :key="df.fieldname"
                  size="large"
                  class="min-w-0 flex-1"
                  :df="df"
                  :value="coupon[df.fieldname]"
                  :read-only="true"
                />
              </FrappeListCell>
              <FrappeListCell class="justify-center">
                <FrappeButton
                  icon="lucide-trash-2"
                  theme="red"
                  variant="ghost"
                  size="xs"
                  :tooltip="t`Remove coupon`"
                  :aria-label="t`Remove coupon`"
                  @click="removeAppliedCoupon(coupon)"
                />
              </FrappeListCell>
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </FrappeList>

      <Link
        v-if="couponField"
        class="min-w-0 w-full"
        :show-label="true"
        :border="true"
        :value="couponCode"
        :focus-input="!isMobile"
        :df="couponField"
        @change="updateCouponCode"
      />
    </div>
    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="cancelApplyCouponCode">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        :disabled="validationError"
        @click="setCouponCode"
        >{{ t`Save` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import Modal from 'src/components/POS/POSDialog.vue';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { defineComponent, inject } from 'vue';
import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import type { AppliedCouponCode } from 'models/invoices/AppliedCouponCode';
import { getField } from 'src/frappe/registry';
import Link from 'src/components/Controls/Link.vue';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import { Button as FrappeButton } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';

export default defineComponent({
  name: 'CouponCodeModal',
  components: {
    Modal,
    Link,
    FormControl,
    FrappeButton,
    FrappeList,
    FrappeListCell,
    FrappeListRow,
    FrappeListRows,
  },
  props: {
    openModal: Boolean,
  },
  emits: ['setCouponsCount', 'toggleModal'],

  setup() {
    return {
      isMobile,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
      appliedCoupons: inject('appliedCoupons') as AppliedCouponCode[],
    };
  },
  data() {
    return {
      validationError: false,
      couponCode: '',
      initialCouponCodes: [] as string[],
    };
  },
  computed: {
    couponField(): Field | undefined {
      return getField('AppliedCouponCodes', 'coupons');
    },
    tableFields() {
      return [
        {
          fieldname: 'coupons',
          fieldtype: 'Link',
          required: true,
          readOnly: true,
        },
      ] as Field[];
    },
  },
  watch: {
    openModal(value: boolean) {
      if (!value) {
        return;
      }

      this.couponCode = '';
      this.validationError = false;
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
        this.validationError = false;

        if ((value as Event).type === 'keydown') {
          value = ((value as Event).target as HTMLInputElement).value;
        }

        this.couponCode = value as string;
        await this.applyCoupon(this.couponCode);
        this.$emit('setCouponsCount', this.sinvDoc.coupons?.length ?? 0);
        this.couponCode = '';
        this.validationError = false;
      } catch (error) {
        this.validationError = true;

        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    /** The server's preview rejects a coupon that does not apply, which is then taken off. */
    async applyCoupon(coupon: string) {
      await this.sinvDoc.append('coupons', { coupons: coupon });
      try {
        await this.sinvDoc.preview();
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
      this.$emit('setCouponsCount', this.sinvDoc.coupons?.length ?? 0);
    },
    async cancelApplyCouponCode() {
      this.couponCode = '';
      await this.sinvDoc.set('coupons', null);

      for (const coupons of this.initialCouponCodes) {
        await this.sinvDoc.append('coupons', { coupons });
      }

      this.$emit('setCouponsCount', this.sinvDoc.coupons?.length ?? 0);
      this.$emit('toggleModal', 'CouponCode');
    },
  },
});
</script>
