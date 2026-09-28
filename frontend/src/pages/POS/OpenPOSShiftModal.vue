<template>
  <Modal
    :open-modal="openModal && !isDismissed && isValuesSeeded"
    :title="t`Open POS Shift`"
    size="3xl"
    @closemodal="handleDismiss"
  >
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-4">
        <h2 class="text-base font-medium text-ink-gray-8">
          {{ t`Cash In Denominations` }}
        </h2>

        <Table
          v-if="isValuesSeeded"
          class="text-base"
          :df="getField('openingCash')"
          :show-header="true"
          :border="true"
          :value="posShiftDoc?.openingCash"
          @row-change="handleChange"
        />
      </div>

      <div class="flex min-w-0 flex-col gap-4">
        <h2 class="text-base font-medium text-ink-gray-8">
          {{ t`Opening Amount` }}
        </h2>

        <Table
          v-if="isValuesSeeded"
          class="text-base"
          :df="getField('openingAmounts')"
          :show-header="true"
          :border="true"
          :value="posShiftDoc?.openingAmounts"
          :read-only="false"
          :allow-add-remove-rows="false"
          @row-change="handleChange"
        />
      </div>
    </div>

    <template #actions>
      <FrappeButton size="md" class="min-w-24" @click="handleDismiss">{{
        t`Back`
      }}</FrappeButton>
      <FrappeButton
        size="md"
        class="min-w-24"
        variant="solid"
        @click="handleSubmit"
        >{{ t`Open Shift` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import Modal from 'src/components/POS/POSDialog.vue';
import Table from 'src/components/Controls/Table.vue';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { computed } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { getCashPaymentMethods, getPOSOpeningShiftDoc } from 'src/utils/pos';

export default defineComponent({
  name: 'OpenPOSShift',
  components: { FrappeButton, Modal, Table },
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
  data() {
    return {
      posShiftDoc: undefined as POSOpeningShift | undefined,
      cashMethods: [] as string[],

      isValuesSeeded: false,
      isDismissed: false,
    };
  },
  computed: {
    getDefaultCashDenominations() {
      return this.fyo.singles.Defaults?.posCashDenominations;
    },
    posOpeningCashAmount(): Money {
      return this.posShiftDoc?.openingCashAmount as Money;
    },
  },
  async mounted() {
    this.isValuesSeeded = false;
    this.posShiftDoc = await getPOSOpeningShiftDoc(fyo);
    this.cashMethods = await getCashPaymentMethods(fyo);

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

      this.posShiftDoc.openingCash = [];
      const denominations = this.getDefaultCashDenominations;

      if (!denominations) {
        return;
      }

      for (const row of denominations) {
        await this.posShiftDoc.append('openingCash', {
          denomination: row.denomination,
          count: 0,
        });
      }
    },
    async seedPaymentMethods() {
      if (!this.posShiftDoc) {
        return;
      }

      this.posShiftDoc.openingAmounts = [];

      const paymentMethods = (
        (await this.fyo.db.getAll(ModelNameEnum.PaymentMethod, {
          fields: ['name'],
        })) as { name: string }[]
      ).map((doc) => ({ paymentMethod: doc.name, amount: fyo.pesa(0) }));

      await this.posShiftDoc.set('openingAmounts', paymentMethods);
    },
    async seedDefaults() {
      if (this.posShiftDoc?.isSubmitted) {
        return;
      }

      await this.seedDefaultCashDenomiations();
      await this.seedPaymentMethods();
    },
    getField(fieldname: string) {
      return this.fyo.getField(ModelNameEnum.POSOpeningShift, fieldname);
    },
    setOpeningCashAmount() {
      if (!this.posShiftDoc?.openingAmounts) {
        return;
      }

      // The counted cash fills the first cash row; the server checks all cash rows add up to it.
      const cashRow = this.posShiftDoc.openingAmounts.find((row) =>
        this.cashMethods.includes(row.paymentMethod as string)
      );
      if (cashRow) {
        cashRow.amount = this.posShiftDoc.openingCashAmount;
      }
    },
    handleChange() {
      this.setOpeningCashAmount();
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
