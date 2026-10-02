<template>
  <Modal
    :open-modal="openModal && isValuesSeeded"
    :title="t`Close POS Shift`"
    size="4xl"
    :dismissible="false"
    @closemodal="$emit('toggleModal', 'ShiftClose', false)"
  >
    <template v-if="isMobile && posClosingShiftDoc">
      <MobileCashCount :heading="t`Closing cash`" :rows="closingCash" />
      <FormControl
        v-for="row in otherClosingAmounts"
        :key="row.idx"
        :df="{
          fieldname: 'closing_amount',
          fieldtype: 'Currency',
          label: t`Counted ${row.payment_method ?? ''}`,
        }"
        :value="row.closing_amount"
        :show-label="true"
        :border="true"
        @change="(amount: Money) => setClosingAmount(row, amount)"
      />
      <section
        class="rounded-6 bg-surface-gray-1"
        :aria-label="t`Closing Amounts`"
      >
        <div
          class="flex h-9 items-center justify-between gap-3 border-b border-outline-gray-1 px-3 text-xs-medium text-ink-gray-5"
        >
          <span>{{ t`Method` }}</span>
          <span>{{ t`Difference` }}</span>
        </div>
        <!-- One row per method, so long names and large amounts never squeeze columns. -->
        <ul>
          <li
            v-for="row in closingAmounts"
            :key="row.idx"
            class="flex flex-col gap-1 border-b border-outline-gray-1 px-3 py-2.5 last:border-b-0"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span
                class="min-w-0 text-base text-ink-gray-8 [overflow-wrap:anywhere]"
              >
                {{ row.payment_method }}
              </span>
              <span
                class="shrink-0 text-base tabular-nums"
                :class="getDifferenceClass(row.difference_amount)"
                dir="ltr"
              >
                {{ format(row.difference_amount) }}
              </span>
            </div>
            <p
              class="flex flex-wrap gap-x-3 text-sm tabular-nums text-ink-gray-5"
            >
              <span class="whitespace-nowrap">
                {{ t`Expected ${format(row.expected_amount)}` }}
              </span>
              <span class="whitespace-nowrap">
                {{ t`Counted ${format(row.closing_amount)}` }}
              </span>
            </p>
          </li>
        </ul>
      </section>
    </template>
    <template v-else>
    <h2 class="mb-3 text-lg-semibold text-ink-gray-8">
      {{ t`Closing Cash` }}
    </h2>
    <Table
      v-if="isValuesSeeded"
      class="text-base"
      :df="getField('closing_cash')"
      :show-header="true"
      :border="true"
      :value="posClosingShiftDoc?.closing_cash ?? []"
      :read-only="false"
    />

    <h2 class="mt-6 mb-3 text-lg-semibold text-ink-gray-8">
      {{ t`Closing Amounts` }}
    </h2>
    <Table
      v-if="isValuesSeeded"
      class="text-base"
      :df="getField('closing_amounts')"
      :show-header="true"
      :border="true"
      :value="posClosingShiftDoc?.closing_amounts"
      :read-only="false"
      :allow-add-remove-rows="false"
    />
    </template>

    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        @click="$emit('toggleModal', 'ShiftClose', false)"
        >{{ t`Cancel` }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="handleSubmit"
        >{{ t`Close Shift` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import Modal from 'src/components/POS/POSDialog.vue';
import Table from 'src/components/Controls/Table.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import { isMobile } from 'src/utils/viewport';
import MobileCashCount from './MobileCashCount.vue';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { Field } from 'schemas/types';
import { CashCount } from 'models/inventory/Point of Sale/POSOpeningShift';
import {
  ClosingAmount,
  POSClosingShift,
} from 'models/inventory/Point of Sale/POSClosingShift';
import { getField } from 'src/frappe/registry';
import { newFrappeDoc } from 'src/frappe/documents';
import { computed } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import {
  getCashPaymentMethods,
  getPOSOpeningShiftDoc,
  validateClosingAmounts,
} from 'src/utils/posSetup';
import { ForbiddenError } from 'fyo/utils/errors';

export default defineComponent({
  name: 'ClosePOSShiftModal',
  components: { FormControl, FrappeButton, MobileCashCount, Modal, Table },
  provide() {
    return {
      doc: computed(() => this.posClosingShiftDoc),
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
    return { isMobile };
  },
  data() {
    return {
      isValuesSeeded: false,

      posClosingShiftDoc: undefined as POSClosingShift | undefined,
      cashMethods: [] as string[],
    };
  },
  computed: {
    closingCash(): CashCount[] {
      return (this.posClosingShiftDoc?.closing_cash ?? []) as CashCount[];
    },
    closingAmounts(): ClosingAmount[] {
      return (this.posClosingShiftDoc?.closing_amounts ??
        []) as ClosingAmount[];
    },
    /** Cash methods share the drawer count; the others are counted one by one. */
    cashClosingAmounts(): ClosingAmount[] {
      return this.closingAmounts.filter((row) =>
        this.cashMethods.includes(row.payment_method as string)
      );
    },
    otherClosingAmounts(): ClosingAmount[] {
      return this.closingAmounts.filter(
        (row) => !this.cashClosingAmounts.includes(row)
      );
    },
    isOnline() {
      return !!navigator.onLine;
    },
  },
  watch: {
    openModal: {
      async handler(value: boolean) {
        if (value) {
          await this.prepareShift();
        }
      },
    },
  },
  methods: {
    /**
     * Counts start from the opening cash. The server's preview, again after
     * each edit, fills the expected amounts, shares the counted cash among the
     * cash methods and works out the differences.
     */
    async prepareShift() {
      this.isValuesSeeded = false;
      this.cashMethods = await getCashPaymentMethods();
      const opening = await getPOSOpeningShiftDoc();
      const closingCash = (opening.opening_cash ?? []).map(
        ({ count, denomination }) => ({ count, denomination })
      );
      this.posClosingShiftDoc = newFrappeDoc(ModelNameEnum.POSClosingShift, {
        closing_cash: closingCash,
      }) as POSClosingShift;
      try {
        await this.posClosingShiftDoc.preview();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }

      this.isValuesSeeded = true;
    },
    getField(fieldname: string): Field {
      return getField(ModelNameEnum.POSClosingShift, fieldname)!;
    },
    /** Colours a difference by its sign; an exact count stays gray. */
    getDifferenceClass(amount?: Money): string {
      if (amount?.isNegative()) return 'text-ink-red-5';
      if (amount?.isPositive()) return 'text-ink-green-5';
      return 'text-ink-gray-9';
    },
    format(amount?: Money): string {
      return fyo.format(amount ?? fyo.pesa(0), 'Currency');
    },
    async setClosingAmount(row: ClosingAmount, amount: Money) {
      await row.set('closing_amount', amount);
    },
    async handleSubmit() {
      try {
        if (!this.isOnline) {
          throw new ForbiddenError(
            t`Device is offline. Please connect to a network to continue.`
          );
        }

        validateClosingAmounts(this.posClosingShiftDoc as POSClosingShift);
        await this.posClosingShiftDoc?.sync();
        await this.posClosingShiftDoc?.submit();

        this.$emit('toggleModal', 'ShiftClose');
      } catch (error) {
        return showToast({
          type: 'error',
          message: t`${error as string}`,
          duration: 'short',
        });
      }
    },
  },
});
</script>
