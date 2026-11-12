<template>
  <Modal
    :open-modal="!isDismissed && isValuesSeeded"
    :title="t`Open POS shift`"
    size="3xl"
    :dismissible="false"
    @closemodal="handleDismiss"
  >
    <template v-if="isMobile && posShiftDoc">
      <FormControl
        v-if="profileDf"
        :df="profileDf"
        :value="posShiftDoc.pos_profile"
        :show-label="true"
        :border="true"
        @change="setProfile"
      />
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
      <MobileDetailList :details="openingAmountDetails" />
    </template>
    <div v-else-if="posShiftDoc" class="flex flex-col gap-5">
      <FormControl
        v-if="profileDf"
        class="w-1/2"
        :df="profileDf"
        :value="posShiftDoc.pos_profile"
        :show-label="true"
        :border="true"
        @change="setProfile"
      />
      <div class="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
        <CashCountTable :heading="t`Cash in drawer`" :rows="openingCash" />

        <section class="flex min-w-0 flex-col gap-2">
          <h3 class="text-base-medium text-ink-gray-8">
            {{ t`Opening amounts` }}
          </h3>
          <ul
            class="flex flex-col divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-1 text-base"
          >
            <li
              v-for="row in posShiftDoc.opening_amounts"
              :key="row.idx"
              class="flex h-10 items-center gap-2 px-3"
            >
              <FrappeIcon
                :icon="
                  paymentMethodIcons[
                    shift.methodTypes[row.payment_method ?? ''] ?? 'Cash'
                  ]
                "
                class="size-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1 truncate text-ink-gray-8">
                {{ row.payment_method }}
              </span>
              <span
                v-if="isCounted(row)"
                class="text-base-medium tabular-nums text-ink-gray-8"
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
    </div>

    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        :variant="isMobile ? 'subtle' : 'ghost'"
        @click="handleDismiss"
        >{{ t`Back` }}</FrappeButton
      >
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="handleSubmit"
        >{{ t`Open shift` }}</FrappeButton
      >
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { getErrorMessage } from 'src/utils';
import Modal from 'src/components/POS/POSDialog.vue';
import CashCountTable from 'src/components/POS/CashCountTable.vue';
import { paymentMethodIcons } from 'src/components/POS/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import { isMobile } from 'src/utils/viewport';
import MobileCashCount from './MobileCashCount.vue';
import MobileDetailList, { type Detail } from 'src/mobile/MobileDetailList.vue';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import {
  CashCount,
  POSOpeningShift,
  ShiftAmount,
} from 'models/inventory/Point of Sale/POSOpeningShift';
import { newFrappeDoc } from 'src/frappe/documents';
import { getAllDocuments } from 'src/frappe/api';
import { getField } from 'src/frappe/registry';
import type { Field } from 'schemas/types';
import type { HistoryState } from 'vue-router';
import { computed, PropType } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import type { POSShift } from 'src/utils/posShift';

export default defineComponent({
  name: 'OpenPOSShift',
  components: {
    CashCountTable,
    FormControl,
    FrappeButton,
    FrappeIcon,
    MobileCashCount,
    MobileDetailList,
    Modal,
  },
  provide() {
    return {
      doc: computed(() => this.posShiftDoc),
    };
  },
  props: {
    shift: { type: Object as PropType<POSShift>, required: true },
  },
  emits: ['opened'],
  setup() {
    return { isMobile, paymentMethodIcons };
  },
  data() {
    return {
      posShiftDoc: undefined as POSOpeningShift | undefined,
      profiles: [] as string[],

      isValuesSeeded: false,
      isDismissed: false,
    };
  },
  computed: {
    /** A Select, not a Link: creating or opening a profile from here would leave the POS without a shift. */
    profileDf(): Field | undefined {
      const field = getField(ModelNameEnum.POSOpeningShift, 'pos_profile');
      if (!field || !this.profiles.length) {
        return undefined;
      }

      return {
        ...field,
        fieldtype: 'Select',
        options: this.profiles.map((name) => ({ value: name, label: name })),
      } as Field;
    },
    getDefaultCashDenominations() {
      return this.fyo.singles.Defaults?.pos_cash_denominations;
    },
    openingCash(): CashCount[] {
      return (this.posShiftDoc?.opening_cash ?? []) as CashCount[];
    },
    otherOpeningAmounts(): ShiftAmount[] {
      return (
        (this.posShiftDoc?.opening_amounts ?? []) as ShiftAmount[]
      ).filter((row) => !this.isCounted(row));
    },
    openingAmountDetails(): Detail[] {
      return ((this.posShiftDoc?.opening_amounts ?? []) as ShiftAmount[]).map(
        (row) => ({
          key: String(row.idx),
          label: row.payment_method ?? '',
          value: fyo.format(row.amount ?? 0, 'Currency'),
        })
      );
    },
    posOpeningCashAmount(): Money {
      return this.posShiftDoc?.openingCashAmount as Money;
    },
  },
  async mounted() {
    this.isValuesSeeded = false;
    this.posShiftDoc = newFrappeDoc(
      ModelNameEnum.POSOpeningShift
    ) as POSOpeningShift;

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
    /** The counted drawer covers cash methods; without denominations, cash is typed like the others. */
    isCounted(row: { payment_method?: string }): boolean {
      return (
        this.openingCash.length > 0 &&
        this.shift.cashMethods.includes(row.payment_method ?? '')
      );
    },
    async setProfile(profile: string) {
      await this.posShiftDoc?.set('pos_profile', profile);
    },
    /** Leaves the POS: back, unless the page before is the POS too, as after a quick edit. */
    async handleDismiss() {
      this.isDismissed = true;
      const back = (history.state as HistoryState | null)?.back;
      if (typeof back === 'string' && back.split('?')[0] !== this.$route.path) {
        this.$router.back();
        return;
      }

      await this.$router.push('/');
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
      const paymentMethods = Object.keys(this.shift.methodTypes).map(
        (name) => ({ payment_method: name, amount: fyo.pesa(0) })
      );

      await this.posShiftDoc.set('opening_amounts', paymentMethods);
    },
    /** The profiles to pick from, starting at the one POS Settings names. */
    async seedProfile() {
      this.profiles = (
        await getAllDocuments('Books Pos Profile', { fields: ['name'] })
      ).map(({ name }) => name as string);
      const profile = fyo.singles.POSSettings?.pos_profile;
      if (this.posShiftDoc && profile) {
        await this.posShiftDoc.set('pos_profile', profile);
      }
    },
    async seedDefaults() {
      await this.seedProfile();
      await this.seedDefaultCashDenomiations();
      await this.seedPaymentMethods();
    },
    async handleSubmit() {
      try {
        await this.posShiftDoc?.sync();
        await this.posShiftDoc?.submit();
        this.$emit('opened');
      } catch (error) {
        showToast({
          type: 'error',
          message: getErrorMessage(error as Error),
          duration: 'short',
        });
        return;
      }
    },
  },
});
</script>
