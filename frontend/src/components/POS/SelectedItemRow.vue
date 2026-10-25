<template>
  <FrappeListCell>
    <button
      type="button"
      class="flex min-w-0 flex-1 flex-col gap-0.5 text-start"
      :aria-expanded="isExpanded"
      @click="selectRow"
    >
      <span
        class="truncate text-base-medium text-ink-gray-8"
        :title="row.item_name || row.item_code"
      >
        {{ row.item_name || row.item_code }}
      </span>
      <span
        v-if="row.is_free_item"
        class="truncate text-xs text-ink-green-5"
        :title="pricingRule"
      >
        {{ pricingRule }}
      </span>
      <span v-else class="truncate text-xs tabular-nums text-ink-gray-5">
        {{ rateLabel }}
      </span>
    </button>
  </FrappeListCell>
  <FrappeListCell>
    <div
      class="flex items-center gap-0.5 rounded-4 p-0.5"
      :class="isExpanded ? 'bg-surface-gray-3' : 'bg-surface-gray-2'"
    >
      <FrappeButton
        v-if="!isSaleSubmitted"
        icon="lucide-minus"
        variant="ghost"
        size="xs"
        :aria-label="t`Decrease quantity`"
        @click="adjustQuantity(-1)"
      />
      <span
        class="min-w-5.5 text-center text-base-medium tabular-nums text-ink-gray-8"
      >
        {{ displayQuantity }}
      </span>
      <FrappeButton
        v-if="!isSaleSubmitted"
        icon="lucide-plus"
        variant="ghost"
        size="xs"
        :aria-label="t`Increase quantity`"
        @click="adjustQuantity(1)"
      />
    </div>
  </FrappeListCell>
  <FrappeListCell class="justify-end">
    <span
      class="truncate text-base tabular-nums text-ink-gray-8"
      :title="amountLabel"
    >
      {{ amountLabel }}
    </span>
  </FrappeListCell>
  <FrappeListCell>
    <FrappeButton
      v-if="!isSaleSubmitted"
      icon="lucide-x"
      variant="ghost"
      size="xs"
      :tooltip="t`Remove item`"
      :aria-label="t`Remove item`"
      @click.stop="removeRow"
    />
  </FrappeListCell>
  <div
    v-if="isExpanded"
    class="col-span-full grid grid-cols-2 gap-3 pb-1.5 pt-0.5"
  >
    <div v-if="isUOMConversionEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'qty',
          label: fieldLabel('qty'),
        }"
        size="medium"
        :border="true"
        :show-label="true"
        :value="row.qty"
        :read-only="isFieldReadOnly('qty')"
        @click="openKeypad('qty')"
        @change="(value: number) => editInline('qty', value)"
      />
    </div>

    <div
      v-if="isUOMConversionEnabled && transferUnitOptions.length"
      class="min-w-0"
    >
      <AutoComplete
        :key="row.item_code"
        :df="{
          fieldtype: 'AutoComplete',
          fieldname: 'uom',
          label: t`Transfer Unit`,
          options: transferUnitOptions,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.uom ?? ''"
        :read-only="isReadOnly"
        @change="setUnit"
      />
    </div>

    <div class="min-w-0">
      <Float
        :df="{
          fieldname: 'stock_qty',
          fieldtype: 'Float',
          label: fieldLabel('stock_qty'),
        }"
        size="medium"
        :min="0"
        :border="true"
        :show-label="true"
        :value="row.stock_qty"
        :read-only="isFieldReadOnly('stock_qty')"
        @click="openKeypad('stock_qty')"
        @change="(value: number) => editInline('stock_qty', value)"
      />
    </div>

    <div class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'price_list_rate',
          label: t`Rate`,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.price_list_rate"
        :read-only="isFieldReadOnly('price_list_rate')"
        @click="openKeypad('price_list_rate')"
        @change="(value: Money) => editInline('price_list_rate', value)"
      />
    </div>

    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'discountAmount',
          label: t`Discount Amount`,
        }"
        class="min-w-0"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.discount_amount"
        :read-only="isFieldReadOnly('discount_amount')"
        @click="openKeypad('discount_amount')"
        @change="(value: Money) => editInline('discount_amount', value)"
      />
    </div>

    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'itemDiscountPercent',
          label: t`Discount Percent`,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.discount_percentage"
        :read-only="isFieldReadOnly('discount_percentage')"
        @click="openKeypad('discount_percentage')"
        @change="(value: number) => editInline('discount_percentage', value)"
      />
    </div>

    <div v-if="hasBatch" class="min-w-0">
      <Link
        :df="{
          fieldname: 'batch_no',
          fieldtype: 'Link',
          target: 'Batch',
          label: t`Batch`,
          filters: [['item', '=', row.item_code]],
        }"
        size="medium"
        :value="row.batch_no"
        :border="true"
        :show-label="true"
        :read-only="isSaleSubmitted"
        @change="(value: string) => row.set('batch_no', value)"
      />
    </div>

    <div v-if="hasBatch" class="min-w-0">
      <Float
        :df="{
          fieldname: 'availableQtyInBatch',
          fieldtype: 'Float',
          label: t`Qty in Batch`,
        }"
        size="medium"
        :min="0"
        :value="batchQuantity"
        :show-label="true"
        :border="true"
        :read-only="true"
        :text-right="true"
      />
    </div>

    <div v-if="hasSerialNumber" class="col-span-2 min-w-0">
      <Text
        :df="{
          label: t`Serial Number`,
          fieldtype: 'Text',
          fieldname: 'serialNumber',
        }"
        :value="String(row.serial_no ?? '')"
        :show-label="true"
        :border="true"
        :required="hasSerialNumber"
        :read-only="isSaleSubmitted"
        @change="(value: string) => setSerialNumber(value)"
      />
    </div>

    <p
      v-if="!isClassic && !isSaleSubmitted"
      class="col-span-2 text-xs text-ink-gray-5"
    >
      {{ t`Tap a number to use the keypad.` }}
    </p>
  </div>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { ListCell as FrappeListCell } from 'frappe-ui/list';
import { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { Money } from 'pesa';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import Currency from 'src/components/Controls/Currency.vue';
import Float from 'src/components/Controls/Float.vue';
import Link from 'src/components/Controls/Link.vue';
import Text from 'src/components/Controls/Text.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  getPOSRowItem,
  getRowGrossAmount,
  getRowPricingRule,
  POSRowItem,
} from 'src/utils/pos';
import {
  getCartRowQuantity,
  getPOSRowFieldLabel,
  isPOSRowFieldReadOnly,
  POSRowField,
  setCartUnit,
  setPOSRowValue,
  stepCartQuantity,
  validateSerialNumberCount,
} from 'src/utils/posCart';
import { getPOSPermissions, POSPermissions } from 'src/utils/posSetup';
import { usePOSBatchQuantity } from 'src/utils/usePOSBatchQuantity';
import { defineComponent, inject, PropType } from 'vue';
import { POSLayout, POS_ITEM_TOAST_ID } from './types';

/** A cart row: its fields edit inline in the Classic layout, with the keypad in Modern. */
export default defineComponent({
  name: 'SelectedItemRow',
  components: {
    AutoComplete,
    Currency,
    Float,
    FrappeButton,
    FrappeListCell,
    Link,
    Text,
  },
  props: {
    row: { type: SalesInvoiceItem, required: true },
    layout: { type: String as PropType<POSLayout>, required: true },
    expandedRow: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
  },
  emits: ['select', 'expand'],
  setup(props) {
    return {
      isDiscountingEnabled: inject('isDiscountingEnabled') as boolean,
      batchQuantity: usePOSBatchQuantity(() => props.row),
    };
  },
  data() {
    return {
      isExpanded: false,
      permissions: {
        canChangeRate: false,
        canEditDiscount: false,
      } as POSPermissions,
      itemSettings: {
        hasBatch: false,
        hasSerialNumber: false,
        units: [],
      } as POSRowItem,
    };
  },
  computed: {
    isClassic(): boolean {
      return this.layout === 'Classic';
    },
    isUOMConversionEnabled(): boolean {
      return fyo.isFeatureOn('enable_uom_conversions');
    },
    isSaleSubmitted(): boolean {
      return !!this.row.parentdoc?.isSubmitted;
    },
    isReadOnly(): boolean {
      return !!this.row.is_free_item || this.isSaleSubmitted;
    },
    hasBatch(): boolean {
      return this.itemSettings.hasBatch;
    },
    hasSerialNumber(): boolean {
      return this.itemSettings.hasSerialNumber;
    },
    transferUnitOptions(): { label: string; value: string }[] {
      return this.itemSettings.units.map((unit) => ({
        label: unit,
        value: unit,
      }));
    },
    /** The amount before the discount, which the rate label lists. */
    amountLabel(): string {
      const sale = this.row.parentdoc as SalesInvoice;
      return fyo.format(getRowGrossAmount(sale, this.row), 'Currency');
    },
    pricingRule(): string {
      return getRowPricingRule(this.row);
    },
    /** The rate per unit, its unit in Classic, and any item discount. */
    rateLabel(): string {
      const rate = fyo.format(this.row.price_list_rate, 'Currency');
      const parts = [
        this.isClassic
          ? t`${rate} per ${this.row.uom || this.row.stock_uom || ''}`
          : t`${rate} each`,
      ];
      if (this.row.discount_percentage) {
        parts.push(t`${this.row.discount_percentage}% off`);
      }

      return parts.join(' · ');
    },
    displayQuantity(): number {
      return getCartRowQuantity(this.row);
    },
  },
  watch: {
    expandedRow(name?: string) {
      if (name !== this.row.name) {
        this.isExpanded = false;
      }
    },
    'row.batch_no': {
      handler(batch?: string) {
        if (batch) {
          this.isExpanded = true;
          this.$emit('expand', this.row.name);
        }
      },
      immediate: true,
    },
    'row.item_code': {
      async handler(item?: string) {
        this.itemSettings = await getPOSRowItem(item);
      },
      immediate: true,
    },
  },
  async mounted() {
    this.permissions = await getPOSPermissions(this.row.parentdoc);
  },
  methods: {
    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      this.$emit('expand', this.isExpanded ? this.row.name : undefined);
    },
    selectRow() {
      this.toggleExpand();
      this.$emit('select', this.row);
    },
    isFieldReadOnly(field: POSRowField): boolean {
      return isPOSRowFieldReadOnly(this.row, field, this.permissions);
    },
    fieldLabel(field: POSRowField): string {
      return getPOSRowFieldLabel(this.row, field);
    },
    openKeypad(field: POSRowField) {
      if (!this.isClassic && !this.isFieldReadOnly(field)) {
        this.$emit('select', this.row, field);
      }
    },
    async editInline(field: POSRowField, value: number | Money) {
      if (this.isClassic) {
        await this.setValue(field, value);
      }
    },
    async setValue(field: POSRowField, value: number | Money) {
      await this.changeRow(() => setPOSRowValue(this.row, field, value));
    },
    async adjustQuantity(step: number) {
      await this.changeRow(() => stepCartQuantity(this.row, step));
    },
    async setUnit(unit: string) {
      await this.changeRow(() => setCartUnit(this.row, unit));
    },
    /** Makes a change to the row; a refused one shows in the cart's toast. */
    async changeRow(change: () => Promise<void>) {
      try {
        await change();
      } catch (error) {
        showToast({
          id: POS_ITEM_TOAST_ID,
          type: 'error',
          message: this.t`${error as string}`,
          duration: 'short',
        });
      }
    },
    async setSerialNumber(serialNumber: string) {
      if (!serialNumber) {
        return;
      }

      await this.changeRow(async () => {
        await this.row.set('serial_no', serialNumber);
        validateSerialNumberCount(this.row);
      });
    },
    async removeRow() {
      await this.row.parentdoc?.remove('items', this.row.idx as number);
    },
  },
});
</script>
