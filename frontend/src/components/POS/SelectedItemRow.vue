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
      <FrappeTooltip :text="row.item">
        <button
          type="button"
          class="block w-full truncate rounded-4 text-start text-sm text-ink-gray-9 hover:bg-surface-gray-2"
          @click="selectRow"
        >
          {{ row.item }}
        </button>
      </FrappeTooltip>
      <p
        v-if="row.is_free_item"
        class="truncate text-xs text-ink-green-7"
        :title="String(row.pricing_rule ?? '')"
      >
        {{ row.pricing_rule }}
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
          :tooltip="t`Increase quantity`"
          :aria-label="t`Increase quantity`"
          @click="adjustQuantity(1)"
        />
        <FrappeButton
          icon="lucide-chevron-down"
          variant="ghost"
          size="xs"
          :tooltip="t`Decrease quantity`"
          :aria-label="t`Decrease quantity`"
          @click="adjustQuantity(-1)"
        />
      </div></div
  ></FrappeListCell>
  <FrappeListCell v-if="isClassic" class="min-h-12"
    ><span
      class="w-full min-w-0 truncate px-2 text-sm text-ink-gray-9"
      :title="row.transfer_unit || row.unit"
      >{{ row.transfer_unit || row.unit }}</span
    ></FrappeListCell
  >
  <FrappeListCell class="min-h-12"
    ><span
      class="w-full min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
      :title="fyo.format(row.transfer_rate, 'Currency')"
      >{{ fyo.format(row.transfer_rate, 'Currency') }}</span
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
          fieldname: 'transfer_quantity',
          label: t`Transfer Quantity`,
        }"
        size="medium"
        :border="true"
        :show-label="true"
        :value="row.transfer_quantity"
        :read-only="isFieldReadOnly('transfer_quantity')"
        @click="openKeypad('transfer_quantity')"
        @change="(value: number) => editInline('transfer_quantity', value)"
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
          fieldname: 'transfer_unit',
          label: t`Transfer Unit`,
          options: transferUnitOptions,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.transfer_unit ?? ''"
        :read-only="isReadOnly"
        @change="(value: string) => row.set('transfer_unit', value)"
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
          fieldname: 'transfer_rate',
          label: t`Rate`,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.transfer_rate"
        :read-only="isFieldReadOnly('transfer_rate')"
        @click="openKeypad('transfer_rate')"
        @change="(value: Money) => editInline('transfer_rate', value)"
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
        :value="row.item_discount_amount"
        :read-only="isFieldReadOnly('item_discount_amount')"
        @click="openKeypad('item_discount_amount')"
        @change="(value: Money) => editInline('item_discount_amount', value)"
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
        :value="row.item_discount_percent"
        :read-only="isFieldReadOnly('item_discount_percent')"
        @click="openKeypad('item_discount_percent')"
        @change="(value: number) => editInline('item_discount_percent', value)"
      />
    </div>

    <div v-if="hasBatch" class="min-w-0">
      <Link
        :df="{
          fieldname: 'batch',
          fieldtype: 'Link',
          target: 'Batch',
          label: t`Batch`,
          filters: [['item', '=', row.item]],
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
        :value="String(row.serial_number ?? '')"
        :show-label="true"
        :border="true"
        :required="hasSerialNumber"
        @change="(value: string) => setSerialNumber(value)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Button as FrappeButton, Tooltip as FrappeTooltip } from 'frappe-ui';
import { ListCell as FrappeListCell } from 'frappe-ui/list';
import { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
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
  getPOSQuantityField,
  getPOSRowItem,
  isPOSRowFieldReadOnly,
  POSRowItem,
  POSRowField,
  refillSerialNumbers,
  setPOSRowValue,
  validateSerialNumberCount,
} from 'src/utils/pos';
import { getPOSPermissions, POSPermissions } from 'src/utils/posSetup';
import { defineComponent, inject, PropType } from 'vue';
import { POSLayout } from './types';

/** A cart row: edited inline in the Classic layout, with the keypad in Modern. */
export default defineComponent({
  name: 'SelectedItemRow',
  components: {
    AutoComplete,
    Currency,
    Float,
    FrappeButton,
    FrappeListCell,
    FrappeTooltip,
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
    };
  },
  data() {
    return {
      isExpanded: false,
      availableQtyInBatch: 0,
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
      return !!fyo.singles.InventorySettings?.enable_uom_conversions;
    },
    isReadOnly(): boolean {
      return !!this.row.is_free_item;
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
    displayQuantity(): number | undefined {
      if (!this.isUOMConversionEnabled) {
        return this.row.quantity;
      }

      const transferQuantity = this.row.transfer_quantity;
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
      async handler(item?: string) {
        this.itemSettings = await getPOSRowItem(item);
      },
      immediate: true,
    },
    'row.quantity'(quantity?: number, previous?: number) {
      if (this.hasSerialNumber && quantity !== previous) {
        refillSerialNumbers(this.row);
      }
    },
  },
  async mounted() {
    this.permissions = await getPOSPermissions();
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
      const field = getPOSQuantityField();
      const quantity = (this.row[field] ?? this.row.quantity ?? 1) + change;
      if (quantity !== 0) {
        await this.setValue(field, quantity);
      }
    },
    async getAvailableQtyInBatch(): Promise<number> {
      return getPOSBatchQuantity(this.row.item as string, this.row.batch);
    },
    async setSerialNumber(serialNumber: string) {
      if (!serialNumber) {
        return;
      }

      await this.row.set('serial_number', serialNumber);
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
