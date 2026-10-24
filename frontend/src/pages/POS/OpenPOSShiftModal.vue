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
        v-if="showsProfile"
        :df="profileField"
        :value="profileName"
        :show-label="true"
        :border="true"
        @change="setProfile"
      />
      <MobileCashCount
        :heading="t`Opening cash`"
        :rows="openingCash"
        :note="cashNote"
      />
      <FormControl
        v-for="row in enteredAmounts"
        :key="row.idx"
        :df="{
          fieldname: 'opening_amount',
          fieldtype: 'Currency',
          label: row.mode_of_payment,
        }"
        :value="row.opening_amount"
        :show-label="true"
        :border="true"
        @change="(amount: Money) => row.set('opening_amount', amount)"
      />
      <MobileDetailList :details="openingAmountDetails" />
    </template>
    <div v-else-if="posShiftDoc" class="flex flex-col gap-5">
      <div v-if="showsProfile" class="w-[340px]">
        <FormControl
          :df="profileField"
          :value="profileName"
          :show-label="true"
          :border="true"
          @change="setProfile"
        />
      </div>
      <div class="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
        <CashCountTable
          :heading="t`Cash in drawer`"
          :rows="openingCash"
          :note="cashNote"
        />

        <section class="flex min-w-0 flex-col gap-2">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-base-medium text-ink-gray-8">
              {{ t`Opening amounts` }}
            </h3>
            <span v-if="profileName" class="text-sm text-ink-gray-5">
              {{ t`From ${profileName}` }}
            </span>
          </div>
          <ul
            class="flex flex-col divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-1 text-base"
          >
            <li
              v-for="row in openingAmounts"
              :key="row.idx"
              class="flex h-10 items-center gap-2 px-3"
            >
              <FrappeIcon
                :icon="
                  paymentMethodIcons[
                    shift.methodTypes[row.mode_of_payment ?? ''] ?? 'Cash'
                  ]
                "
                class="size-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1 truncate text-ink-gray-8">
                {{ row.mode_of_payment }}
              </span>
              <span
                v-if="isCounted(row)"
                class="text-base-medium tabular-nums text-ink-gray-8"
                dir="ltr"
              >
                {{ fyo.format(row.opening_amount ?? 0, 'Currency') }}
              </span>
              <FormControl
                v-else
                class="w-32"
                size="small"
                :border="true"
                :df="{
                  fieldname: 'opening_amount',
                  fieldtype: 'Currency',
                  label: row.mode_of_payment,
                }"
                :value="row.opening_amount"
                @change="(amount: Money) => row.set('opening_amount', amount)"
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
  CashCountRow,
  POSOpeningEntry,
  OpeningBalance,
  getCashTotal,
} from 'models/inventory/Point of Sale/POSOpeningEntry';
import type { OptionField } from 'schemas/types';
import { newFrappeDoc } from 'src/frappe/documents';
import { isAccessoryMode } from 'src/frappe/mode';
import { computed, PropType } from 'vue';
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { t } from 'fyo';
import { getCashDenominations } from 'src/utils/posSetup';
import {
  getCashCounter,
  getDefaultProfile,
  type POSShift,
} from 'src/utils/posShift';

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
    return { isMobile, paymentMethodIcons, isAccessory: isAccessoryMode() };
  },
  data() {
    return {
      posShiftDoc: undefined as POSOpeningEntry | undefined,
      // Accessory mode saves only the counted total.
      cashCounter: [] as CashCountRow[],
      profileName: '',

      isValuesSeeded: false,
      isDismissed: false,
    };
  },
  computed: {
    openingCash(): CashCountRow[] {
      if (this.isAccessory) {
        return this.cashCounter as CashCountRow[];
      }

      return (this.posShiftDoc?.opening_cash ?? []) as CashCountRow[];
    },
    cashNote(): string {
      return this.isAccessory ? t`Only the total is saved` : '';
    },
    showsProfile(): boolean {
      return this.shift.profiles.length > 1;
    },
    profileField(): OptionField {
      return {
        fieldname: 'pos_profile',
        fieldtype: 'Select',
        label: t`POS profile`,
        sub_label: t`POS Profiles assigned to you in ERPNext`,
        required: true,
        options: this.shift.profiles.map((name) => ({
          value: name,
          label: name,
        })),
      };
    },
    openingAmounts(): OpeningBalance[] {
      return (this.posShiftDoc?.balance_details ?? []) as OpeningBalance[];
    },
    /** In accessory mode the drawer count covers the first cash method, when cash is counted. */
    countedAmount(): OpeningBalance | undefined {
      if (!this.isAccessory || !this.openingCash.length) {
        return undefined;
      }

      return this.openingAmounts.find((row) =>
        this.shift.cashMethods.includes(row.mode_of_payment ?? '')
      );
    },
    enteredAmounts(): OpeningBalance[] {
      return this.openingAmounts.filter((row) => !this.isCounted(row));
    },
    openingAmountDetails(): Detail[] {
      return this.openingAmounts.map((row) => ({
        key: String(row.idx),
        label: row.mode_of_payment ?? '',
        value: fyo.format(row.opening_amount ?? 0, 'Currency'),
      }));
    },
    countedCash(): Money {
      return getCashTotal(fyo.pesa(0), this.openingCash);
    },
  },
  watch: {
    async countedCash() {
      await this.setCountedAmount();
    },
  },
  async mounted() {
    this.isValuesSeeded = false;
    this.posShiftDoc = newFrappeDoc(
      ModelNameEnum.POSOpeningEntry
    ) as POSOpeningEntry;

    if (this.isAccessory) {
      await this.seedProfile();
    } else {
      await this.seedDefaults();
    }
    this.isValuesSeeded = true;
  },
  activated() {
    this.isDismissed = false;
  },
  deactivated() {
    this.isDismissed = true;
  },
  methods: {
    /** The counted drawer covers cash methods; the others are entered one by one. */
    isCashMethod(paymentMethod?: string): boolean {
      return this.shift.cashMethods.includes(paymentMethod ?? '');
    },
    isCounted(row: OpeningBalance): boolean {
      if (this.isAccessory) {
        return row === this.countedAmount;
      }

      return this.isCashMethod(row.mode_of_payment);
    },
    handleDismiss() {
      this.isDismissed = true;
      this.$router.back();
    },
    async seedDefaultCashDenomiations() {
      if (!this.posShiftDoc) {
        return;
      }

      this.posShiftDoc.opening_cash = [];
      for (const denomination of getCashDenominations()) {
        await this.posShiftDoc.append('opening_cash', {
          denomination,
          count: 0,
        });
      }
    },
    /** The server's preview lists a row per mode of payment. */
    async seedDefaults() {
      await this.seedDefaultCashDenomiations();
      await this.preview();
    },
    /** Starts with the POS Profile opened last, and counts cash in the preferred denominations. */
    async seedProfile() {
      this.cashCounter = getCashCounter(getCashDenominations());
      await this.setProfile(await getDefaultProfile(this.shift.profiles));
    },
    /** ERPNext's preview lists a row per mode of payment of the profile. */
    async setProfile(name: string) {
      this.profileName = name;
      await this.posShiftDoc?.set('pos_profile', name);
      await this.preview();
      await this.setCountedAmount();
    },
    async setCountedAmount() {
      await this.countedAmount?.set('opening_amount', this.countedCash);
    },
    async preview() {
      try {
        await this.posShiftDoc?.preview();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
    },
    async handleSubmit() {
      try {
        await this.posShiftDoc?.sync();
        await this.posShiftDoc?.submit();
        this.$emit('opened');
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
