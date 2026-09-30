<template>
  <Modal
    :open-modal="openModal && isValuesSeeded"
    :title="t`Close POS Shift`"
    size="4xl"
    :dismissible="false"
    @closemodal="$emit('toggleModal', 'ShiftClose', false)"
  >
    <template v-if="isMobile && posClosingShiftDoc">
      <MobileCashCount
        :heading="t`Closing cash`"
        :rows="closingCash"
        @change="updateClosingAmounts"
      />
      <FormControl
        v-for="row in otherClosingAmounts"
        :key="row.idx"
        :df="{
          fieldname: 'closingAmount',
          fieldtype: 'Currency',
          label: t`Counted ${row.paymentMethod ?? ''}`,
        }"
        :value="row.closingAmount"
        :show-label="true"
        :border="true"
        @change="(amount: Money) => setClosingAmount(row, amount)"
      />
      <table class="w-full rounded-6 bg-surface-gray-1 text-base tabular-nums">
        <thead class="text-xs-medium text-ink-gray-5">
          <tr class="h-11 border-b border-outline-gray-1">
            <th class="ps-3 text-start font-medium">{{ t`Method` }}</th>
            <th class="px-1.5 text-end font-medium">{{ t`Expected` }}</th>
            <th class="px-1.5 text-end font-medium">{{ t`Counted` }}</th>
            <th class="pe-3 text-end font-medium">{{ t`Difference` }}</th>
          </tr>
        </thead>
        <tbody class="text-ink-gray-8">
          <tr
            v-for="row in closingAmounts"
            :key="row.idx"
            class="h-11 border-b border-outline-gray-1 last:border-b-0"
          >
            <td class="ps-3">{{ row.paymentMethod }}</td>
            <td class="whitespace-nowrap px-1.5 text-end" dir="ltr">
              {{ format(row.expectedAmount) }}
            </td>
            <td class="whitespace-nowrap px-1.5 text-end" dir="ltr">
              {{ format(row.closingAmount) }}
            </td>
            <td
              class="whitespace-nowrap pe-3 text-end"
              :class="{ 'text-ink-red-4': row.differenceAmount?.isNegative() }"
              dir="ltr"
            >
              {{ format(row.differenceAmount) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-else>
    <h2 class="mb-3 text-base font-medium text-ink-gray-8">
      {{ t`Closing Cash` }}
    </h2>
    <Table
      v-if="isValuesSeeded"
      class="text-base"
      :df="getField('closingCash')"
      :show-header="true"
      :border="true"
      :value="posClosingShiftDoc?.closingCash ?? []"
      :read-only="false"
      @row-change="updateClosingAmounts"
    />

    <h2 class="mt-6 mb-3 text-base text-ink-gray-8 font-medium">
      {{ t`Closing Amounts` }}
    </h2>
    <Table
      v-if="isValuesSeeded"
      class="text-base"
      :df="getField('closingAmounts')"
      :show-header="true"
      :border="true"
      :value="posClosingShiftDoc?.closingAmounts"
      :read-only="false"
      :allow-add-remove-rows="false"
      @row-change="updateClosingAmounts"
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
import { ClosingCash } from 'models/inventory/Point of Sale/ClosingCash';
import { ClosingAmounts } from 'models/inventory/Point of Sale/ClosingAmounts';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { OpeningAmounts } from 'models/inventory/Point of Sale/OpeningAmounts';
import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { computed } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import {
  getCashPaymentMethods,
  getPOSOpeningShiftDoc,
  validateClosingAmounts,
} from 'src/utils/pos';
import { POSClosingShift } from 'models/inventory/Point of Sale/POSClosingShift';
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

      posOpeningShiftDoc: undefined as POSOpeningShift | undefined,
      posClosingShiftDoc: undefined as POSClosingShift | undefined,
      transactedAmount: {} as Record<string, Money> | undefined,
      cashMethods: [] as string[],
    };
  },
  computed: {
    closingCash(): ClosingCash[] {
      return (this.posClosingShiftDoc?.closingCash ?? []) as ClosingCash[];
    },
    closingAmounts(): ClosingAmounts[] {
      return (this.posClosingShiftDoc?.closingAmounts ?? []) as ClosingAmounts[];
    },
    /** Cash methods share the drawer count; the others are counted one by one. */
    cashClosingAmounts(): ClosingAmounts[] {
      return this.closingAmounts.filter((row) =>
        this.cashMethods.includes(row.paymentMethod as string)
      );
    },
    otherClosingAmounts(): ClosingAmounts[] {
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
    async prepareShift() {
      this.isValuesSeeded = false;
      this.posClosingShiftDoc = fyo.doc.getNewDoc(
        ModelNameEnum.POSClosingShift
      ) as POSClosingShift;
      this.cashMethods = await getCashPaymentMethods(fyo);
      await this.setTransactedAmount();
      await this.seedValues();
    },
    async setTransactedAmount() {
      this.posOpeningShiftDoc = await getPOSOpeningShiftDoc(fyo);

      const fromDate = this.posOpeningShiftDoc?.openingDate as Date;
      if (!fromDate) {
        return;
      }

      this.transactedAmount = await fyo.db.getPOSTransactedAmount(
        fromDate,
        new Date()
      );
    },
    async seedClosingCash() {
      if (!this.posClosingShiftDoc) {
        return;
      }

      this.posClosingShiftDoc.closingCash = [];

      for (const row of this.posOpeningShiftDoc?.openingCash ?? []) {
        await this.posClosingShiftDoc?.append('closingCash', {
          count: row.count,
          denomination: row.denomination as Money,
        });
      }
    },
    updateClosingAmounts() {
      if (!this.posClosingShiftDoc?.closingAmounts) {
        return;
      }

      this.splitCountedCash(this.posClosingShiftDoc.closingCashAmount as Money);
      this.posClosingShiftDoc.closingAmounts.forEach((row) => {
        row.closingAmount ??= fyo.pesa(0);
        row.differenceAmount = row.closingAmount.sub(
          row.expectedAmount as Money
        );
      });
    },
    /**
     * Each cash method takes up to what it expects and the first also any
     * surplus, so the rows add up to the count as the server checks.
     */
    splitCountedCash(counted: Money) {
      let remaining = counted;
      for (const row of this.cashClosingAmounts) {
        const expected = row.expectedAmount ?? fyo.pesa(0);
        const share = expected.isNegative()
          ? fyo.pesa(0)
          : expected.lt(remaining)
          ? expected
          : remaining;
        row.closingAmount = share;
        remaining = remaining.sub(share);
      }

      const [first] = this.cashClosingAmounts;
      if (first) {
        first.closingAmount = first.closingAmount!.add(remaining);
      }
    },
    async seedClosingAmounts() {
      if (!this.posClosingShiftDoc || !this.posOpeningShiftDoc) {
        return;
      }

      this.posClosingShiftDoc.closingAmounts = [];

      const openingAmounts = this.posOpeningShiftDoc
        ?.openingAmounts as OpeningAmounts[];

      for (const row of openingAmounts) {
        if (!row.paymentMethod) {
          return;
        }

        let expectedAmount = row.amount ?? fyo.pesa(0);

        if (this.transactedAmount) {
          expectedAmount = expectedAmount.add(
            this.transactedAmount[row.paymentMethod] ?? fyo.pesa(0)
          );
        }

        await this.posClosingShiftDoc.append('closingAmounts', {
          paymentMethod: row.paymentMethod,
          openingAmount: row.amount,
          closingAmount: fyo.pesa(0),
          expectedAmount: expectedAmount,
          differenceAmount: fyo.pesa(0),
        });
      }
    },
    async seedValues() {
      this.isValuesSeeded = false;
      await this.seedClosingCash();
      await this.seedClosingAmounts();
      this.updateClosingAmounts();
      this.isValuesSeeded = true;
    },
    getField(fieldname: string) {
      return fyo.getField(ModelNameEnum.POSClosingShift, fieldname);
    },
    format(amount?: Money): string {
      return fyo.format(amount ?? fyo.pesa(0), 'Currency');
    },
    async setClosingAmount(row: ClosingAmounts, amount: Money) {
      await row.set('closingAmount', amount);
      this.updateClosingAmounts();
    },
    async handleSubmit() {
      try {
        if (!this.isOnline) {
          throw new ForbiddenError(
            t`Device is offline. Please connect to a network to continue.`
          );
        }

        validateClosingAmounts(this.posClosingShiftDoc as POSClosingShift);
        await this.posClosingShiftDoc?.set(
          'openingShift',
          this.posOpeningShiftDoc?.name
        );
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
