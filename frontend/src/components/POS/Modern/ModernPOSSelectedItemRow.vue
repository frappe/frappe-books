<template>
  <FrappeListCell class="min-h-12"
    ><div class="w-full flex justify-center">
      <FrappeButton
        :icon="isExapanded ? 'lucide-chevron-up' : 'lucide-chevron-down'"
        variant="ghost"
        size="xs"
        :tooltip="isExapanded ? t`Collapse item` : t`Expand item`"
        :aria-label="isExapanded ? t`Collapse item` : t`Expand item`"
        :aria-expanded="isExapanded"
        @click="toggleExpand"
      /></div
  ></FrappeListCell>
  <FrappeListCell class="min-h-12"
    ><div class="w-full min-w-0 px-2">
      <FrappeButton
        variant="ghost"
        class="!h-auto !w-full !justify-start !px-0 text-start [&>span]:min-w-0"
        :tooltip="row.item"
        @click="toggleExpand"
      >
        <span class="truncate text-sm text-ink-gray-9">{{
          row.item
        }}</span>
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
    ><span
      class="w-full min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
      :title="fyo.format(displayQuantity, 'Float')"
      >{{ fyo.format(displayQuantity, 'Float') }}</span
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
        @click.stop="removeAddedItem(row)"
      /></div
  ></FrappeListCell>
  <div
    v-if="isExapanded"
    class="col-span-full grid grid-cols-2 gap-4 border-t border-outline-gray-1 px-3 py-4"
  >
    <div class="min-w-0">
      <Float
        :df="{
          fieldname: 'quantity',
          fieldtype: 'Float',
          label: t`Quantity`,
        }"
        @click="handleOpenKeyboard(row, 'quantity')"
        size="medium"
        :min="0"
        :border="true"
        :show-label="true"
        :value="row.quantity"
        :read-only="isReadOnly || isUOMConversionEnabled"
      />
    </div>

    <div
      v-if="isUOMConversionEnabled && transferUnitOptions.length"
      class="min-w-0"
    >
      <AutoComplete
        :key="row.item"
        :df="{
          fieldname: 'transferUnit',
          fieldtype: 'AutoComplete',
          label: t`Transfer Unit`,
          options: transferUnitOptions,
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.transferUnit"
        :read-only="isReadOnly"
        @change="(value: string) => row.set('transferUnit', value)"
      />
    </div>

    <div v-if="isUOMConversionEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'transferQuantity',
          label: t`Transfer Quantity`,
        }"
        @click="!isReadOnly && handleOpenKeyboard(row, 'transferQuantity')"
        size="medium"
        :border="true"
        :show-label="true"
        :value="row.transferQuantity"
        :read-only="isReadOnly"
      />
    </div>
    <div class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'rate',
          label: t`Rate`,
        }"
        @click="handleOpenKeyboard(row, 'rate')"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.rate"
        :read-only="isRateReadOnly"
      />
    </div>
    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'discountAmount',
          label: 'Discount Amount',
        }"
        @click="handleOpenKeyboard(row, 'itemDiscountAmount')"
        class="min-w-0"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.itemDiscountAmount"
        :read-only="
          isDiscountReadOnly((row.itemDiscountPercent as number) > 0)
        "
      />
    </div>

    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'itemDiscountPercent',
          label: t`Discount Percent`,
        }"
        @click="handleOpenKeyboard(row, 'itemDiscountPercent')"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.itemDiscountPercent"
        :read-only="isDiscountReadOnly(!row.itemDiscountAmount?.isZero())"
      />
    </div>

    <div
      v-if="row.links?.item && row.links?.item.hasBatch"
      class="min-w-0"
    >
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
        @change="(value: string) => setBatch(value)"
      />
    </div>

    <div
      v-if="row.links?.item && row.links?.item.hasBatch"
      class="min-w-0"
    >
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
import { ListCell as FrappeListCell } from 'frappe-ui/list';
import { Button as FrappeButton } from 'frappe-ui';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import Currency from 'src/components/Controls/Currency.vue';
import Float from 'src/components/Controls/Float.vue';
import Link from 'src/components/Controls/Link.vue';
import Text from 'src/components/Controls/Text.vue';
import { inject } from 'vue';
import { fyo } from 'src/initFyo';
import { defineComponent, PropType } from 'vue';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { Money } from 'pesa';
import { validateSerialNumberCount } from 'src/utils/pos';
import { getExistingActiveSerialNumbersForItem } from 'models/inventory/helpers';
import { getPOSPermissionSetting } from 'src/utils/pos';
import { getPOSBatchQuantity } from 'models/inventory/posStock';

export default defineComponent({
  name: 'ModernPOSSelectedItemRow',
  components: {
    FrappeListCell,
    AutoComplete,
    Currency,
    Float,
    Link,
    Text,
    FrappeButton,
  },
  props: {
    row: { type: SalesInvoiceItem, required: true },
    batchAdded: { type: Boolean, default: false },
    expandedBatchId: {
      type: String as PropType<string | null | undefined>,
      default: undefined,
    },
  },
  emits: [
    'toggleModal',
    'runSinvFormulas',
    'selectedRow',
    'applyPricingRule',
    'setExpandedBatchId',
  ],

  setup() {
    return {
      isDiscountingEnabled: inject('isDiscountingEnabled') as boolean,
      itemSerialNumbers: inject('itemSerialNumbers') as {
        [item: string]: string;
      },
    };
  },
  data() {
    return {
      isExapanded: false,
      batches: [] as string[],
      availableQtyInBatch: 0,
      itemVisibility: '',
      defaultRate: this.row.rate as Money,
      canChangeRate: false,
      canEditDiscount: false,
      transferUnitOptions: [] as Array<{ label: string; value: string }>,
    };
  },
  watch: {
    expandedBatchId(newVal) {
      if (newVal !== this.row.name) {
        this.isExapanded = false;
      }
    },
    'row.batch': {
      async handler(newBatch) {
        if (newBatch) {
          this.availableQtyInBatch = await this.getAvailableQtyInBatch();
          this.isExapanded = true;
          this.$emit('setExpandedBatchId', this.row.name);
        }
      },
      immediate: true,
    },
    'row.item': {
      async handler(newItem) {
        if (newItem) {
          await this.updateTransferUnitOptions();
        } else {
          this.transferUnitOptions = [];
        }
      },
      immediate: true,
    },
    'row.quantity': {
      async handler(newQuantity, oldQuantity) {
        if (this.hasSerialNumber && newQuantity && newQuantity !== oldQuantity) {
          await this.fetchSerialNumbers();
        }
      },
    },
  },
  computed: {
    isUOMConversionEnabled(): boolean {
      return !!fyo.singles.InventorySettings?.enableUomConversions;
    },
    hasSerialNumber(): boolean {
      return !!(this.row.links?.item && this.row.links?.item.hasSerialNumber);
    },
    isReadOnly() {
      return this.row.isFreeItem;
    },
    displayQuantity() {
      if (!this.isUOMConversionEnabled) {
        return this.row.quantity;
      }

      const transferQuantity = this.row.transferQuantity;
      if (this.row.isReturn && transferQuantity) {
        return -Math.abs(transferQuantity);
      }

      return transferQuantity;
    },
    isRateReadOnly() {
      return this.isReadOnly || !this.canChangeRate;
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
      if (this.isExapanded) {
        this.isExapanded = false;
        this.$emit('setExpandedBatchId', undefined);
      } else {
        this.isExapanded = true;
        this.$emit('setExpandedBatchId', this.row.name);
      }
    },
    handleOpenKeyboard(row: SalesInvoiceItem, field: string) {
      const isDiscountField = field === 'itemDiscountAmount' || field === 'itemDiscountPercent';
      if (
        this.isReadOnly ||
        (field === 'quantity' && this.isUOMConversionEnabled) ||
        (field === 'rate' && !this.canChangeRate) ||
        (isDiscountField && !this.canEditDiscount)
      ) {
        return;
      }

      this.$emit('selectedRow', row, field);
      this.$emit('toggleModal', 'Keyboard');
    },
    async updateTransferUnitOptions() {
      if (!this.row.item) {
        this.transferUnitOptions = [];
        return;
      }

      const itemDoc = await fyo.doc.getDoc('Item', this.row.item as string);
      const conversions = (itemDoc?.uomConversions ?? []) as Array<{
        uom: string;
      }>;
      const validUnits = new Set<string>();

      if (typeof itemDoc?.unit === 'string') {
        validUnits.add(itemDoc.unit);
      }

      for (const conversion of conversions) {
        if (typeof conversion.uom === 'string') {
          validUnits.add(conversion.uom);
        }
      }

      this.transferUnitOptions = [...validUnits].map((unit) => ({
        label: unit,
        value: unit,
      }));
    },
    isDiscountReadOnly(hasConflictingDiscount: boolean) {
      return this.isReadOnly || !this.canEditDiscount || hasConflictingDiscount;
    },
    async getAvailableQtyInBatch(): Promise<number> {
      if (!this.row.batch) {
        return 0;
      }

      return getPOSBatchQuantity(
        fyo,
        this.row.item as string,
        this.row.batch
      );
    },
    async setBatch(batch: string) {
      this.row.set('batch', batch);
      this.availableQtyInBatch = await this.getAvailableQtyInBatch();
    },
    async setSerialNumber(serialNumber: string) {
      if (!serialNumber) {
        return;
      }

      await this.row.set('serialNumber', serialNumber);
      this.itemSerialNumbers[this.row.item as string] = serialNumber;

      validateSerialNumberCount(serialNumber, Math.abs(this.row.quantity ?? 0), this.row.item!);
    },
    async fetchSerialNumbers() {
      if (!this.hasSerialNumber) {
        return;
      }

      const quantity = Math.abs(this.row.quantity ?? 0);
      if (quantity <= 0) {
        return;
      }

      const existingSerialNumbers = this.itemSerialNumbers[this.row.item as string] ?? '';
      const existingCount = existingSerialNumbers
        .split('\n')
        .filter((serialNumber) => serialNumber.trim()).length;

      if (existingCount === quantity) {
        return;
      }

      const serialNumbers = await getExistingActiveSerialNumbersForItem(
        fyo,
        this.row.item as string,
        quantity,
      );

      if (!serialNumbers) {
        return;
      }

      await this.row.set('serialNumber', serialNumbers);
      this.itemSerialNumbers[this.row.item as string] = serialNumbers;
    },
    async removeAddedItem(row: SalesInvoiceItem) {
      this.row.parentdoc?.remove('items', row?.idx as number);

      if (!row.isFreeItem) {
        this.$emit('applyPricingRule');
      }
    },
  },
});
</script>
