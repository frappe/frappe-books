<template>
  <Modal
    :open-modal="openModal && isValuesSeeded"
    :title="t`Close POS shift`"
    size="2xl"
    :dismissible="false"
    @closemodal="$emit('toggleModal', 'ShiftClose', false)"
  >
    <template v-if="isMobile && posClosingShiftDoc">
      <MobileCashCount
        :heading="t`Closing cash`"
        :rows="closingCash"
        :note="cashNote"
      />
      <FormControl
        v-for="row in otherClosingAmounts"
        :key="row.idx"
        :df="{
          fieldname: 'closing_amount',
          fieldtype: 'Currency',
          label: t`Counted ${row.mode_of_payment ?? ''}`,
        }"
        :value="row.closing_amount"
        :show-label="true"
        :border="true"
        @change="(amount: Money) => setClosingAmount(row, amount)"
      />
      <section
        class="rounded-6 bg-surface-gray-1"
        :aria-label="t`Closing amounts`"
      >
        <div
          class="flex h-9 items-center justify-between gap-3 border-b border-outline-gray-1 px-3 text-xs-medium text-ink-gray-5"
        >
          <span>{{ methodLabel }}</span>
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
                {{ row.mode_of_payment }}
              </span>
              <span
                class="shrink-0 text-base tabular-nums"
                :class="getDifferenceClass(row.difference)"
                dir="ltr"
              >
                {{ format(row.difference) }}
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
    <div v-else-if="posClosingShiftDoc" class="flex flex-col gap-6">
      <CashCountTable
        :heading="t`Count the drawer`"
        :rows="closingCash"
        :note="cashNote"
      />

      <section class="flex min-w-0 flex-col gap-2">
        <h3 class="text-base-medium text-ink-gray-8">
          {{ t`Closing amounts` }}
        </h3>
        <div
          class="flex flex-col rounded-6 border border-outline-gray-1 text-base tabular-nums"
        >
          <div
            class="grid h-8 items-center gap-2 rounded-t-6 bg-surface-gray-1 px-3 text-sm text-ink-gray-5"
            :class="amountColumns"
          >
            <span>{{ methodLabel }}</span>
            <span v-if="!isAccessory" class="text-end">{{ t`Opening` }}</span>
            <span class="text-end">{{ t`Expected` }}</span>
            <span class="text-end">{{ countedLabel }}</span>
            <span class="text-end">{{ t`Difference` }}</span>
          </div>
          <div
            v-for="row in closingAmounts"
            :key="row.idx"
            class="grid h-10 items-center gap-2 border-t border-outline-gray-1 px-3"
            :class="amountColumns"
          >
            <span class="truncate text-ink-gray-8">{{
              row.mode_of_payment
            }}</span>
            <span
              v-if="!isAccessory"
              class="truncate text-end text-ink-gray-6"
              dir="ltr"
            >
              {{ format(row.opening_amount) }}
            </span>
            <span class="truncate text-end text-ink-gray-8" dir="ltr">
              {{ format(row.expected_amount) }}
            </span>
            <span
              v-if="cashClosingAmounts.includes(row)"
              class="truncate text-end text-base-medium text-ink-gray-8"
              dir="ltr"
            >
              {{ format(row.closing_amount) }}
            </span>
            <FormControl
              v-else
              size="small"
              :border="true"
              :df="{
                fieldname: 'closing_amount',
                fieldtype: 'Currency',
                label: t`Counted ${row.mode_of_payment ?? ''}`,
              }"
              :value="row.closing_amount"
              @change="(amount: Money) => setClosingAmount(row, amount)"
            />
            <span
              class="truncate text-end text-base-medium"
              :class="getDifferenceClass(row.difference)"
              dir="ltr"
            >
              {{ format(row.difference) }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        @click="$emit('toggleModal', 'ShiftClose', false)"
        >{{ t`Cancel` }}</FrappeButton
      >
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="handleSubmit"
        >{{ t`Close shift` }}</FrappeButton
      >
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import Modal from 'src/components/POS/POSDialog.vue';
import CashCountTable from 'src/components/POS/CashCountTable.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import { isMobile } from 'src/utils/viewport';
import MobileCashCount from './MobileCashCount.vue';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import {
  CashCount,
  CashCountRow,
  getCashTotal,
} from 'models/inventory/Point of Sale/POSOpeningEntry';
import {
  ClosingAmount,
  POSClosingEntry,
} from 'models/inventory/Point of Sale/POSClosingEntry';
import { newFrappeDoc } from 'src/frappe/documents';
import { isAccessoryMode } from 'src/frappe/mode';
import { computed, PropType } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import { getCashDenominations } from 'src/utils/posSetup';
import { getCashCounter, type POSShift } from 'src/utils/posShift';
import { ForbiddenError } from 'fyo/utils/errors';

export default defineComponent({
  name: 'ClosePOSShiftModal',
  components: {
    CashCountTable,
    FormControl,
    FrappeButton,
    MobileCashCount,
    Modal,
  },
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
    shift: { type: Object as PropType<POSShift>, required: true },
  },
  emits: ['toggleModal', 'closed'],
  setup() {
    const isAccessory = isAccessoryMode();
    return {
      isMobile,
      isAccessory,
      // ERPNext's closing has no opening column: its expected amount includes it.
      amountColumns: isAccessory
        ? 'grid-cols-[minmax(0,1fr)_6.5rem_7rem_6rem]'
        : 'grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6.5rem_5.5rem]',
      methodLabel: isAccessory ? t`Mode of payment` : t`Method`,
      countedLabel: isAccessory ? t`Counted` : t`Closing`,
      cashNote: isAccessory ? t`Only the total is saved` : '',
    };
  },
  data() {
    return {
      isValuesSeeded: false,
      // Accessory mode saves only the counted total.
      cashCounter: [] as CashCountRow[],

      posClosingShiftDoc: undefined as POSClosingEntry | undefined,
    };
  },
  computed: {
    closingCash(): CashCountRow[] {
      if (this.isAccessory) {
        return this.cashCounter as CashCountRow[];
      }

      return (this.posClosingShiftDoc?.closing_cash ?? []) as CashCount[];
    },
    closingAmounts(): ClosingAmount[] {
      return (this.posClosingShiftDoc?.payment_reconciliation ??
        []) as ClosingAmount[];
    },
    /**
     * Cash methods share the drawer count; the others are counted one by one.
     * In accessory mode the count covers the first cash method, when cash is counted.
     */
    cashClosingAmounts(): ClosingAmount[] {
      const cashAmounts = this.closingAmounts.filter((row) =>
        this.shift.cashMethods.includes(row.mode_of_payment as string)
      );
      if (!this.isAccessory) {
        return cashAmounts;
      }

      return this.closingCash.length ? cashAmounts.slice(0, 1) : [];
    },
    otherClosingAmounts(): ClosingAmount[] {
      return this.closingAmounts.filter(
        (row) => !this.cashClosingAmounts.includes(row)
      );
    },
    countedCash(): Money {
      return getCashTotal(fyo.pesa(0), this.closingCash);
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
    async countedCash() {
      await this.setCountedCash();
    },
  },
  methods: {
    async prepareShift() {
      this.isValuesSeeded = false;
      if (this.isAccessory) {
        await this.prepareERPNextShift();
      } else {
        await this.prepareBooksShift();
      }

      this.isValuesSeeded = true;
    },
    /**
     * Counts start from the opening cash. The server's preview, again after
     * each edit, fills the expected amounts, shares the counted cash among the
     * cash methods and works out the differences.
     */
    async prepareBooksShift() {
      const openingCash = this.shift.openShift?.opening_cash ?? [];
      const closingCash = openingCash.map(({ count, denomination }) => ({
        count,
        denomination,
      }));
      this.posClosingShiftDoc = newFrappeDoc(ModelNameEnum.POSClosingEntry, {
        closing_cash: closingCash,
      }) as POSClosingEntry;
      await this.preview();
    },
    /**
     * ERPNext's preview fills the shift's invoices and, per mode of payment,
     * the expected amount, which the counted one starts at. The drawer count
     * starts afresh, as only its total was saved.
     */
    async prepareERPNextShift() {
      this.cashCounter = getCashCounter(getCashDenominations());
      this.posClosingShiftDoc = newFrappeDoc(
        ModelNameEnum.POSClosingEntry
      ) as POSClosingEntry;
      await this.posClosingShiftDoc.set(
        'pos_opening_entry',
        this.shift.openShift?.name ?? null
      );
      await this.preview();
      await this.setCountedCash();
    },
    async setCountedCash() {
      if (this.isAccessory) {
        await this.cashClosingAmounts[0]?.set(
          'closing_amount',
          this.countedCash
        );
      }
    },
    async preview() {
      try {
        await this.posClosingShiftDoc?.preview();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
    },
    /** Colours a difference by its sign; an exact count stays gray. */
    getDifferenceClass(amount?: Money): string {
      if (amount?.isNegative()) return 'text-ink-red-5';
      if (amount?.isPositive()) return 'text-ink-green-5';
      return 'text-ink-gray-8';
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

        await this.posClosingShiftDoc?.sync();
        await this.posClosingShiftDoc?.submit();
        this.$emit('closed');
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
