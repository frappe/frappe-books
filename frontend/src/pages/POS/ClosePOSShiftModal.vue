<template>
  <Modal
    :open-modal="openModal && isValuesSeeded"
    :title="t`Close POS Shift`"
    size="4xl"
    @closemodal="$emit('toggleModal', 'ShiftClose', false)"
  >
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
  components: { FrappeButton, Modal, Table },
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

      // The counted cash fills the first cash row; the server checks all cash rows add up to it.
      const cashRow = this.posClosingShiftDoc.closingAmounts.find((row) =>
        this.cashMethods.includes(row.paymentMethod as string)
      );
      this.posClosingShiftDoc.closingAmounts.forEach((row) => {
        if (row === cashRow) {
          row.closingAmount = this.posClosingShiftDoc
            ?.closingCashAmount as Money;
        }

        row.closingAmount ??= fyo.pesa(0);
        row.differenceAmount = row.closingAmount.sub(
          row.expectedAmount as Money
        );
      });
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
