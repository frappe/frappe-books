<template>
  <Modal
    :open-modal="openModal && !isDismissed && isValuesSeeded"
    :title="t`Open POS shift`"
    size="3xl"
    :dismissible="false"
    @closemodal="handleDismiss"
  >
    <template v-if="isMobile && posShiftDoc">
      <MobileCashCount :heading="t`Opening cash`" :rows="openingCash" />
      <FormControl
        v-for="row in otherOpeningAmounts"
        :key="row.idx"
        :df="{
          fieldname: 'amount',
          fieldtype: 'Currency',
          label: row.payment_method,
        }"
        :value="row.amount"
        :show-label="true"
        :border="true"
        @change="(amount: Money) => row.set('amount', amount)"
      />
      <dl class="flex flex-col rounded-6 bg-surface-gray-1 text-md tabular-nums">
        <div
          v-for="row in posShiftDoc.opening_amounts"
          :key="row.idx"
          class="flex min-h-11 items-center justify-between gap-2 border-b border-outline-gray-1 px-3 last:border-b-0"
        >
          <dt class="text-ink-gray-8">{{ row.payment_method }}</dt>
          <dd class="text-ink-gray-9" dir="ltr">
            {{ fyo.format(row.amount ?? 0, 'Currency') }}
          </dd>
        </div>
      </dl>
    </template>
    <div
      v-else-if="posShiftDoc"
      class="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6"
    >
      <CashCountTable :heading="t`Cash in drawer`" :rows="openingCash" />

      <section class="flex min-w-0 flex-col gap-2">
        <h3 class="text-base-medium text-ink-gray-9">
          {{ t`Opening amounts` }}
        </h3>
        <ul
          class="flex flex-col divide-y divide-outline-gray-1 rounded-5 border border-outline-gray-1 text-base"
        >
          <li
            v-for="row in posShiftDoc.opening_amounts"
            :key="row.idx"
            class="flex h-10 items-center gap-2 px-3"
          >
            <FrappeIcon
              :icon="paymentMethodIcons[methodTypes[row.payment_method ?? ''] ?? 'Cash']"
              class="size-4 shrink-0 text-ink-gray-5"
            />
            <span class="min-w-0 flex-1 truncate text-ink-gray-8">
              {{ row.payment_method }}
            </span>
            <span
              v-if="row.payment_method === 'Cash'"
              class="text-base-medium tabular-nums text-ink-gray-9"
              dir="ltr"
            >
              {{ fyo.format(row.amount ?? 0, 'Currency') }}
            </span>
            <FormControl
              v-else
              class="w-32"
              size="small"
              :border="true"
              :df="{
                fieldname: 'amount',
                fieldtype: 'Currency',
                label: row.payment_method,
              }"
              :value="row.amount"
              @change="(amount: Money) => row.set('amount', amount)"
            />
          </li>
        </ul>
      </section>
    </div>

    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="ghost"
        @click="handleDismiss"
        >{{ t`Back` }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="handleSubmit"
        >{{ t`Open shift` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import Modal from 'src/components/POS/POSDialog.vue';
import CashCountTable from 'src/components/POS/CashCountTable.vue';
import { paymentMethodIcons } from 'src/components/POS/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import { isMobile } from 'src/utils/viewport';
import MobileCashCount from './MobileCashCount.vue';
import { PaymentMethodType } from 'models/types';
import { Money } from 'pesa';
import {
  CashCount,
  POSOpeningShift,
  ShiftAmount,
} from 'models/inventory/Point of Sale/POSOpeningShift';
import { getAllDocuments } from 'src/frappe/api';
import { computed } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { getPOSOpeningShiftDoc } from 'src/utils/posSetup';

export default defineComponent({
  name: 'OpenPOSShift',
  components: {
    CashCountTable,
    FormControl,
    FrappeButton,
    FrappeIcon,
    MobileCashCount,
    Modal,
  },
  provide() {
    return {
      doc: computed(() => this.posShiftDoc),
    };
  },
  props: {
    openModal: {
      default: false,
      type: Boolean,
    },
  },
  emits: ['toggleModal'],
  setup() {
    return { isMobile, paymentMethodIcons };
  },
  data() {
    return {
      posShiftDoc: undefined as POSOpeningShift | undefined,
      methodTypes: {} as Record<string, PaymentMethodType>,

      isValuesSeeded: false,
      isDismissed: false,
    };
  },
  computed: {
    getDefaultCashDenominations() {
      return this.fyo.singles.Defaults?.pos_cash_denominations;
    },
    openingCash(): CashCount[] {
      return (this.posShiftDoc?.opening_cash ?? []) as CashCount[];
    },
    otherOpeningAmounts(): ShiftAmount[] {
      return ((this.posShiftDoc?.opening_amounts ?? []) as ShiftAmount[]).filter(
        (row) => row.payment_method !== 'Cash'
      );
    },
    posOpeningCashAmount(): Money {
      return this.posShiftDoc?.openingCashAmount as Money;
    },
  },
  async mounted() {
    this.isValuesSeeded = false;
    this.posShiftDoc = await getPOSOpeningShiftDoc();

    await this.seedDefaults();
    this.isValuesSeeded = true;
  },
  activated() {
    this.isDismissed = false;
  },
  deactivated() {
    this.isDismissed = true;
  },
  methods: {
    handleDismiss() {
      this.isDismissed = true;
      this.$router.back();
    },
    async seedDefaultCashDenomiations() {
      if (!this.posShiftDoc) {
        return;
      }

      this.posShiftDoc.opening_cash = [];
      const denominations = this.getDefaultCashDenominations;

      if (!denominations) {
        return;
      }

      for (const row of denominations) {
        await this.posShiftDoc.append('opening_cash', {
          denomination: row.denomination,
          count: 0,
        });
      }
    },
    async seedPaymentMethods() {
      if (!this.posShiftDoc) {
        return;
      }

      this.posShiftDoc.opening_amounts = [];

      const methods = await getAllDocuments('Books Payment Method', {
        fields: ['name', 'type'],
      });
      this.methodTypes = Object.fromEntries(
        methods.map(({ name, type }) => [name, type as PaymentMethodType])
      );
      const paymentMethods = methods.map(({ name }) => ({
        payment_method: name as string,
        amount: fyo.pesa(0),
      }));

      await this.posShiftDoc.set('opening_amounts', paymentMethods);
    },
    async seedDefaults() {
      if (this.posShiftDoc?.isSubmitted) {
        return;
      }

      await this.seedDefaultCashDenomiations();
      await this.seedPaymentMethods();
    },
    async handleSubmit() {
      try {
        if (this.posShiftDoc?.openingCashAmount.isNegative()) {
          throw new ValidationError(
            t`Opening Cash Amount can not be negative.`
          );
        }

        await this.posShiftDoc?.sync();
        await this.posShiftDoc?.submit();

        this.$emit('toggleModal', 'ShiftOpen');
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
          duration: 'short',
        });
        return;
      }
    },
  },
});
</script>
