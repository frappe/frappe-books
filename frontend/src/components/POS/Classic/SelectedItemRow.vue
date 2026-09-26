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
        @click="toggleExpandAndEmit"
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
    ><div class="w-full flex min-w-0 items-center justify-end gap-1">
      <span
        class="min-w-0 truncate px-2 text-end text-sm tabular-nums text-ink-gray-9"
        :title="fyo.format(getDisplayTransferQuantity(), 'Float')"
        >{{ fyo.format(getDisplayTransferQuantity(), 'Float') }}</span
      >
      <div class="flex shrink-0 flex-col">
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
  <FrappeListCell class="min-h-12"
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
        @click.stop="removeAddedItem(row)"
      /></div
  ></FrappeListCell>
  <div
    v-if="isExapanded"
    class="col-span-full grid grid-cols-2 gap-4 border-t border-outline-gray-1 px-3 py-4"
  >
    <div v-if="isUOMConversionEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'transferQuantity',
          label: 'Transfer Quantity',
        }"
        size="medium"
        :border="true"
        :show-label="true"
        :value="getDisplayTransferQuantity()"
        @change="(value: number) => setTransferQuantity(value)"
        :read-only="isReadOnly"
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
        class="flex-1"
        :show-label="true"
        :border="true"
        :value="row.transferUnit ?? ''"
        @change="(value: string) => row.set('transferUnit', value)"
        :read-only="isReadOnly"
      />
    </div>

    <div class="min-w-0">
      <Float
        :df="{
          fieldname: 'quantity',
          fieldtype: 'Float',
          label: 'Quantity',
        }"
        size="medium"
        :min="0"
        :border="true"
        :show-label="true"
        :value="row.quantity"
        @change="(value: number) => setQuantity(value)"
        :read-only="isUOMConversionEnabled"
      />
    </div>

    <div class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'rate',
          label: 'Rate',
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.rate"
        :read-only="isRateReadOnly()"
        @change="(value: Money) => setRate((row.rate = value))"
      />
    </div>
    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Currency
        :df="{
          fieldtype: 'Currency',
          fieldname: 'discountAmount',
          label: 'Discount Amount',
        }"
        class="min-w-0"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.itemDiscountAmount"
        :read-only="
          isDiscountsReadOnly((row.itemDiscountPercent as number) > 0)
        "
        @change="(value: number) => setItemDiscount('amount', value)"
      />
    </div>

    <div v-if="isDiscountingEnabled" class="min-w-0">
      <Float
        :df="{
          fieldtype: 'Float',
          fieldname: 'itemDiscountPercent',
          label: 'Discount Percent',
        }"
        size="medium"
        :show-label="true"
        :border="true"
        :value="row.itemDiscountPercent"
        :read-only="isDiscountsReadOnly(!row.itemDiscountAmount?.isZero())"
        @change="(value: number) => setItemDiscount('percent', value)"
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
        :value="row.batch"
        :border="true"
        :show-label="true"
        :read-only="false"
        @change="(value: string) => setBatch(value)"
      />
    </div>

    <div v-if="showAvlQuantityInBatch" class="min-w-0">
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
        :value="
          String(
            itemSerialNumbers[row.item as string] || row.serialNumber || ''
          )
        "
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
import Currency from 'src/components/Controls/Currency.vue';
import Float from 'src/components/Controls/Float.vue';
import Link from 'src/components/Controls/Link.vue';
import Text from 'src/components/Controls/Text.vue';
import { inject } from 'vue';
import { fyo } from 'src/initFyo';
import { defineComponent, PropType } from 'vue';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { Money } from 'pesa';
import { DiscountType } from '../types';
import { validateSerialNumberCount } from 'src/utils/pos';
import { getItemVisibility, validateQty } from 'models/helpers';
import { InvoiceItem } from 'models/baseModels/InvoiceItem/InvoiceItem';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { showToast } from 'src/utils/interactive';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import { getExistingActiveSerialNumbersForItem } from 'models/inventory/helpers';
import { getPOSPermissionSetting } from 'src/utils/pos';
import { getPOSBatchQuantity } from 'models/inventory/posStock';

export default defineComponent({
  name: 'SelectedItemRow',
  components: {
    FrappeListCell,
    Currency,
    Float,
    Link,
    Text,
    AutoComplete,
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
  emits: ['runSinvFormulas', 'applyPricingRule', 'selectedRow', 'setExpandedBatchId'],
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
      profileDiscountSetting: null as boolean | null,
      profileRateSetting: null as boolean | null,
      transferUnitOptions: [] as Array<{ label: string; value: string }>,
      isMounted: false,
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
        if (
          this.hasSerialNumber &&
          newQuantity &&
          newQuantity > 0 &&
          this.isMounted &&
          newQuantity !== oldQuantity
        ) {
          await this.fetchSerialNumbers();
        }
      },
      immediate: false,
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
    showAvlQuantityInBatch() {
      return this.row.links?.item && this.row.links?.item.hasBatch && this.itemVisibility;
    },
  },

  async mounted() {
    [this.profileDiscountSetting, this.profileRateSetting] = await Promise.all([
      getPOSPermissionSetting(this.fyo, 'canEditDiscount'),
      getPOSPermissionSetting(this.fyo, 'canChangeRate'),
    ]);
    this.itemVisibility = await getItemVisibility(this.fyo);

    await this.$nextTick();

    this.isMounted = true;

    if (this.hasSerialNumber) {
      await this.fetchSerialNumbers();
    }
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
    toggleExpandAndEmit() {
      this.toggleExpand();
      this.$emit('selectedRow', this.row);
    },
    emitSelectedRow() {
      this.$emit('selectedRow', this.row);
    },
    async adjustQuantity(change: number) {
      const currentQuantity = this.isUOMConversionEnabled
        ? (this.row.transferQuantity ?? this.row.quantity ?? 1)
        : (this.row.quantity ?? 1);
      const newQuantity = currentQuantity + change;

      if (newQuantity === 0) {
        return;
      }

      if (this.isUOMConversionEnabled) {
        await this.setTransferQuantity(newQuantity);
        return;
      }

      await this.setQuantity(newQuantity);
    },
    async updateTransferUnitOptions() {
      if (!this.row.item) {
        this.transferUnitOptions = [];
        return;
      }

      const itemDoc = await fyo.doc.getDoc('Item', this.row.item as string);

      const conversions = (itemDoc?.uomConversions ?? []) as Array<{
        uom: string;
        conversionFactor: number;
      }>;

      const allowedUoms = new Set<string>();

      if (typeof itemDoc?.unit === 'string') {
        allowedUoms.add(itemDoc.unit);
      }

      for (const c of conversions) {
        if (typeof c.uom === 'string') {
          allowedUoms.add(c.uom);
        }
      }

      this.transferUnitOptions = [...allowedUoms].map((uom) => ({
        label: uom,
        value: uom,
      }));
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

    getDisplayTransferQuantity() {
      const transferQty = this.row.transferQuantity;

      if (!this.isUOMConversionEnabled) {
        return transferQty;
      }

      const hasValidQuantity = transferQty && transferQty;

      if (this.row.isReturn && hasValidQuantity) {
        return -Math.abs(transferQty);
      }

      return transferQty;
    },

    isDiscountsReadOnly(isValidDiscount: boolean) {
      const canEditDiscount = this.profileDiscountSetting;

      return this.row.isFreeItem || !canEditDiscount || isValidDiscount;
    },
    async setBatch(batch: string) {
      this.row.set('batch', batch);
      await this.getAvailableQtyInBatch();
    },
    setSerialNumber(serialNumber: string) {
      if (!serialNumber) {
        return;
      }

      this.row.set('serialNumber', serialNumber);
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

      const existingSerialNumbers = this.itemSerialNumbers[this.row.item as string];

      if (existingSerialNumbers) {
        const existingCount = existingSerialNumbers.split('\n').filter((s) => s.trim()).length;

        if (existingCount === quantity) {
          return;
        }
      }

      try {
        const serialNumbers = await getExistingActiveSerialNumbersForItem(
          this.fyo,
          this.row.item as string,
          quantity,
        );

        if (serialNumbers) {
          await this.row.set('serialNumber', serialNumbers);
          this.itemSerialNumbers[this.row.item as string] = serialNumbers;
        }
      } catch {}
    },
    isRateReadOnly() {
      const canChangeRate = this.profileRateSetting;
      return this.row.isFreeItem || !canChangeRate;
    },
    setItemDiscount(type: DiscountType, value: Money | number) {
      if (type === 'percent') {
        this.row.set('setItemDiscountAmount', false);
        this.row.set('itemDiscountPercent', value as number);
        return;
      }
      this.row.set('setItemDiscountAmount', true);
      this.row.set('itemDiscountAmount', value as Money);
    },
    setRate(rate: Money) {
      this.row.setRate = rate;
      this.$emit('runSinvFormulas');
    },
    async setQuantity(quantity: number) {
      const previousQuantity = this.row.quantity ?? 1;
      const hasManualDiscount = this.row.setItemDiscountAmount;
      const isPercentageDiscount = !hasManualDiscount && this.row.itemDiscountPercent !== 0;
      const manualDiscountAmount = this.row.itemDiscountAmount;
      const manualDiscountPercent = this.row.itemDiscountPercent;

      if (!this.row.isReturn && quantity <= 0) {
        showToast({
          type: 'error',
          message: 'Quantity must be greater than zero.',
          duration: 'short',
        });

        quantity = previousQuantity;
      }

      await this.row.set('quantity', quantity);

      const existingItems =
        (this.row.parentdoc as SalesInvoice).items?.filter(
          (invoiceItem: InvoiceItem) =>
            invoiceItem.item === this.row.item && !invoiceItem.isFreeItem,
        ) ?? [];

      try {
        await validateQty(this.row.parentdoc as SalesInvoice, this.row, existingItems);
      } catch (error) {
        await this.row.set('quantity', previousQuantity);

        return showToast({
          type: 'error',
          message: this.t`${error as string}`,
          duration: 'short',
        });
      }

      if (!this.row.isFreeItem) {
        this.$emit('applyPricingRule');
        this.$emit('runSinvFormulas');

        if (!hasManualDiscount && !isPercentageDiscount) {
          this.row.set('setItemDiscountAmount', false);
          this.row.set('itemDiscountPercent', 0);
        }

        if (hasManualDiscount) {
          this.row.set('setItemDiscountAmount', true);
          this.row.set('itemDiscountAmount', manualDiscountAmount);
        } else if (isPercentageDiscount) {
          this.row.set('setItemDiscountAmount', false);
          this.row.set('itemDiscountPercent', manualDiscountPercent);
        }
      }
    },
    async setTransferQuantity(transferQuantity: number) {
      const previousTransferQuantity = this.row.transferQuantity ?? this.row.quantity ?? 1;
      const previousQuantity = this.row.quantity ?? 1;
      const hasManualDiscount = this.row.setItemDiscountAmount;
      const isPercentageDiscount = !hasManualDiscount && this.row.itemDiscountPercent !== 0;
      const manualDiscountAmount = this.row.itemDiscountAmount;
      const manualDiscountPercent = this.row.itemDiscountPercent;

      if (!this.row.isReturn && transferQuantity <= 0) {
        showToast({
          type: 'error',
          message: 'Quantity must be greater than zero.',
          duration: 'short',
        });
        return;
      }

      await this.row.set('transferQuantity', transferQuantity);

      const existingItems =
        (this.row.parentdoc as SalesInvoice).items?.filter(
          (invoiceItem: InvoiceItem) =>
            invoiceItem.item === this.row.item && !invoiceItem.isFreeItem,
        ) ?? [];

      try {
        await validateQty(this.row.parentdoc as SalesInvoice, this.row, existingItems);
      } catch (error) {
        await this.row.set('transferQuantity', previousTransferQuantity);
        await this.row.set('quantity', previousQuantity);

        return showToast({
          type: 'error',
          message: this.t`${error as string}`,
          duration: 'short',
        });
      }

      await this.fetchSerialNumbers();

      if (!this.row.isFreeItem) {
        this.$emit('applyPricingRule');
        this.$emit('runSinvFormulas');

        if (!hasManualDiscount && !isPercentageDiscount) {
          this.row.set('setItemDiscountAmount', false);
          this.row.set('itemDiscountPercent', 0);
        } else if (hasManualDiscount) {
          this.row.set('setItemDiscountAmount', true);
          this.row.set('itemDiscountAmount', manualDiscountAmount);
        } else {
          this.row.set('setItemDiscountAmount', false);
          this.row.set('itemDiscountPercent', manualDiscountPercent);
        }
      }
    },
    async removeAddedItem(row: SalesInvoiceItem) {
      this.row.parentdoc?.remove('items', row?.idx as number);
      this.row.runFormulas();
      if (!row.isFreeItem) {
        this.$emit('applyPricingRule');
      }
    },
  },
});
</script>
