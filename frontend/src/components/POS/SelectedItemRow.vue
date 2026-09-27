<template>
  <FrappeListCell class="min-h-12"
    ><div class="w-full flex justify-center">
      <FrappeButton
        :icon="isExpanded ? 'lucide-chevron-up' : 'lucide-chevron-down'"
        variant="ghost"
        size="xs"
        :tooltip="isExpanded ? t`Collapse item` : t`Expand item`"
        :aria-label="isExpanded ? t`Collapse item` : t`Expand item`"
        :aria-expanded="isExpanded"
        @click="toggleExpand"
      /></div
  ></FrappeListCell>
  <FrappeListCell class="min-h-12"
    ><div class="w-full min-w-0 px-2">
      <FrappeButton
        variant="ghost"
        class="!h-auto !w-full !justify-start !px-0 text-start [&>span]:min-w-0"
        :tooltip="row.item"
        @click="selectRow"
      >
        <span class="truncate text-sm text-ink-gray-9">{{ row.item }}</span>
      </FrappeButton>
      <p
        v-if="row.isFreeItem"
        class="truncate text-xs text-ink-green-7"
        :title="String(row.pricingRule ?? '')"
      >
        {{ row.pricingRule }}
      </p>
    </div></FrappeListCell
  >
  <FrappeListCell class="min-h-12"
    ><div class="w-full flex min-w-0 items-center justify-end gap-1">
      <span
        class="min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
        :title="fyo.format(displayQuantity, 'Float')"
        >{{ fyo.format(displayQuantity, 'Float') }}</span
      >
      <div v-if="isClassic" class="flex shrink-0 flex-col">
        <FrappeButton
          icon="lucide-chevron-up"
          variant="ghost"
          size="xs"
          class="!h-5 !w-6"
          :tooltip="t`Increase quantity`"
          :aria-label="t`Increase quantity`"
          @click="adjustQuantity(1)"
        />
        <FrappeButton
          icon="lucide-chevron-down"
          variant="ghost"
          size="xs"
          class="!h-5 !w-6"
          :tooltip="t`Decrease quantity`"
          :aria-label="t`Decrease quantity`"
          @click="adjustQuantity(-1)"
        />
      </div></div
  ></FrappeListCell>
  <FrappeListCell v-if="isClassic" class="min-h-12"
    ><span
      class="w-full min-w-0 truncate px-2 text-sm text-ink-gray-9"
      :title="row.transferUnit || row.unit"
      >{{ row.transferUnit || row.unit }}</span
    ></FrappeListCell
  >
  <FrappeListCell class="min-h-12"
    ><span
      class="w-full min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
      :title="fyo.format(row.rate, 'Currency')"
      >{{ fyo.format(row.rate, 'Currency') }}</span
    ></FrappeListCell
  >
  <FrappeListCell class="min-h-12"
    ><span
      class="w-full min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
      :title="fyo.format(row.amount, 'Currency')"
      >{{ fyo.format(row.amount, 'Currency') }}</span
    ></FrappeListCell
  >
  <FrappeListCell class="min-h-12"
    ><div class="w-full flex justify-center">
      <FrappeButton
        icon="lucide-trash-2"
        theme="red"
        variant="ghost"
        size="xs"
        :tooltip="t`Remove item`"
        :aria-label="t`Remove item`"
        @click.stop="removeRow"
      /></div
  ></FrappeListCell>
  <div
    v-if="isExpanded"
    class="col-span-full grid grid-cols-2 gap-4 border-t border-outline-gray-1 px-3 py-4"
  >
    <div v-if="isUOMConversionEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'transferQuantity',
          label: t`Transfer Quantity`,
        }"
        size="medium"
        :border="true"
        :show-label="true"
        :value="row.transferQuantity"
        :read-only="isFieldReadOnly('transferQuantity')"
        @click="openKeypad('transferQuantity')"
        @change="(value: number) => editInline('transferQuantity', value)"
      />
    </div>

    <div
      v-if="isUOMConversionEnabled && transferUnitOptions.length"
      class="min-w-0"
    >
      <AutoComplete
        :key="row.item"
        :df="{
          fieldtype: 'AutoComplete',
          fieldname: 'transferUnit',
          label: t`Transfer Unit`,
          options: transferUnitOptions,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.transferUnit ?? ''"
        :read-only="isReadOnly"
        @change="(value: string) => row.set('transferUnit', value)"
      />
    </div>

    <div class="min-w-0">
      <Float
        :df="{
          fieldname: 'quantity',
          fieldtype: 'Float',
          label: t`Quantity`,
        }"
        size="medium"
        :min="0"
        :border="true"
        :show-label="true"
        :value="row.quantity"
        :read-only="isFieldReadOnly('quantity')"
        @click="openKeypad('quantity')"
        @change="(value: number) => editInline('quantity', value)"
      />
    </div>

    <div class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'rate',
          label: t`Rate`,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.rate"
        :read-only="isFieldReadOnly('rate')"
        @click="openKeypad('rate')"
        @change="(value: Money) => editInline('rate', value)"
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
        :value="row.itemDiscountAmount"
        :read-only="isFieldReadOnly('itemDiscountAmount')"
        @click="openKeypad('itemDiscountAmount')"
        @change="(value: Money) => editInline('itemDiscountAmount', value)"
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
        :value="row.itemDiscountPercent"
        :read-only="isFieldReadOnly('itemDiscountPercent')"
        @click="openKeypad('itemDiscountPercent')"
        @change="(value: number) => editInline('itemDiscountPercent', value)"
      />
    </div>

    <div v-if="hasBatch" class="min-w-0">
      <Link
        :df="{
          fieldname: 'batch',
          fieldtype: 'Link',
          target: 'Batch',
          label: t`Batch`,
          filters: { item: row.item as string },
        }"
        size="medium"
        :value="row.batch"
        :border="true"
        :show-label="true"
        :read-only="false"
        @change="(value: string) => row.set('batch', value)"
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
        :value="availableQtyInBatch"
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
        :value="String(row.serialNumber ?? '')"
        :show-label="true"
        :border="true"
        :required="hasSerialNumber"
        @change="(value: string) => setSerialNumber(value)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { ListCell as FrappeListCell } from 'frappe-ui/list';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { getPOSBatchQuantity } from 'models/inventory/posStock';
import { Money } from 'pesa';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import Currency from 'src/components/Controls/Currency.vue';
import Float from 'src/components/Controls/Float.vue';
import Link from 'src/components/Controls/Link.vue';
import Text from 'src/components/Controls/Text.vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  fillRowSerialNumbers,
  getPOSPermissionSetting,
  POSRowField,
  setPOSRowValue,
  validateSerialNumberCount,
} from 'src/utils/pos';
import { defineComponent, inject, PropType } from 'vue';
import { ItemSerialNumbers, POSLayout } from './types';

/** A cart row: edited inline in the Classic layout, with the keypad in Modern. */
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
  setup() {
    return {
      isDiscountingEnabled: inject('isDiscountingEnabled') as boolean,
      itemSerialNumbers: inject('itemSerialNumbers') as ItemSerialNumbers,
    };
  },
  data() {
    return {
      isExpanded: false,
      availableQtyInBatch: 0,
      canChangeRate: false,
      canEditDiscount: false,
      transferUnitOptions: [] as { label: string; value: string }[],
    };
  },
  computed: {
    isClassic(): boolean {
      return this.layout === 'Classic';
    },
    isUOMConversionEnabled(): boolean {
      return !!fyo.singles.InventorySettings?.enableUomConversions;
    },
    isReadOnly(): boolean {
      return !!this.row.isFreeItem;
    },
    hasBatch(): boolean {
      return !!this.row.links?.item?.hasBatch;
    },
    hasSerialNumber(): boolean {
      return !!this.row.links?.item?.hasSerialNumber;
    },
    displayQuantity(): number | undefined {
      if (!this.isUOMConversionEnabled) {
        return this.row.quantity;
      }

      const transferQuantity = this.row.transferQuantity;
      if (this.row.isReturn && transferQuantity) {
        return -Math.abs(transferQuantity);
      }

      return transferQuantity;
    },
  },
  watch: {
    expandedRow(name?: string) {
      if (name !== this.row.name) {
        this.isExpanded = false;
      }
    },
    'row.batch': {
      async handler(batch?: string) {
        if (batch) {
          this.availableQtyInBatch = await this.getAvailableQtyInBatch();
          this.isExpanded = true;
          this.$emit('expand', this.row.name);
        }
      },
      immediate: true,
    },
    'row.item': {
      async handler() {
        await this.updateTransferUnitOptions();
      },
      immediate: true,
    },
    'row.quantity': {
      async handler(quantity?: number, previous?: number) {
        if (this.hasSerialNumber && quantity !== previous) {
          await fillRowSerialNumbers(this.row, this.itemSerialNumbers);
        }
      },
    },
  },
  async mounted() {
    [this.canChangeRate, this.canEditDiscount] = await Promise.all([
      getPOSPermissionSetting(this.fyo, 'canChangeRate'),
      getPOSPermissionSetting(this.fyo, 'canEditDiscount'),
    ]);
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
      if (this.isReadOnly) {
        return true;
      }

      switch (field) {
        case 'quantity':
          return this.isUOMConversionEnabled;
        case 'rate':
          return !this.canChangeRate;
        case 'itemDiscountAmount':
          return !this.canEditDiscount || (this.row.itemDiscountPercent ?? 0) > 0;
        case 'itemDiscountPercent':
          return !this.canEditDiscount || !this.row.itemDiscountAmount?.isZero();
        default:
          return false;
      }
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
      try {
        await setPOSRowValue(this.row, field, value);
      } catch (error) {
        showToast({
          type: 'error',
          message: this.t`${error as string}`,
          duration: 'short',
        });
      }
    },
    async adjustQuantity(change: number) {
      const field = this.isUOMConversionEnabled ? 'transferQuantity' : 'quantity';
      const quantity = (this.row[field] ?? this.row.quantity ?? 1) + change;
      if (quantity !== 0) {
        await this.setValue(field, quantity);
      }
    },
    async updateTransferUnitOptions() {
      if (!this.row.item) {
        this.transferUnitOptions = [];
        return;
      }

      const item = await fyo.doc.getDoc('Item', this.row.item);
      const conversions = (item.uomConversions ?? []) as { uom?: string }[];
      const units = new Set(
        [item.unit, ...conversions.map(({ uom }) => uom)].filter(
          (unit): unit is string => typeof unit === 'string'
        )
      );
      this.transferUnitOptions = [...units].map((unit) => ({
        label: unit,
        value: unit,
      }));
    },
    async getAvailableQtyInBatch(): Promise<number> {
      return getPOSBatchQuantity(fyo, this.row.item as string, this.row.batch);
    },
    async setSerialNumber(serialNumber: string) {
      if (!serialNumber) {
        return;
      }

      await this.row.set('serialNumber', serialNumber);
      this.itemSerialNumbers[this.row.item as string] = serialNumber;
      validateSerialNumberCount(
        serialNumber,
        Math.abs(this.row.quantity ?? 0),
        this.row.item as string
      );
    },
    async removeRow() {
      await this.row.parentdoc?.remove('items', this.row.idx as number);
    },
  },
});
</script>
