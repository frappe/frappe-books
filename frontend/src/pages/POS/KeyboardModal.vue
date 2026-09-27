<template>
  <Modal
    :open-modal="modalStatus"
    :title="modalTitle"
    @closemodal="closeKeyboardModal"
  >
    <NumericKeypad
      ref="keypad"
      v-model="selectedValue"
      :label="fieldLabel"
      :error="validationError"
      :disabled="saving"
      @submit="saveSelectedItem"
      @cancel="closeKeyboardModal"
    />

    <template #actions>
      <Button
        size="md"
        class="min-w-24"
        :disabled="saving"
        @click="closeKeyboardModal"
        >{{ t`Cancel` }}</Button
      >
      <Button
        size="md"
        class="min-w-24"
        type="primary"
        :disabled="saving"
        :loading="saving"
        @click="saveSelectedItem"
        >{{ t`Save` }}</Button
      >
    </template>
  </Modal>
</template>

<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { InvoiceItem } from 'models/baseModels/InvoiceItem/InvoiceItem';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { validateQty } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import Button from 'src/components/Button.vue';
import Modal from 'src/components/POS/POSDialog.vue';
import NumericKeypad from 'src/components/POS/NumericKeypad.vue';
import { parseNumericDraft } from 'src/components/POS/numericKeypad';
import { getErrorMessage } from 'src/utils';
import { defineComponent, inject } from 'vue';

type NumericKeypadRef = {
  begin: () => Promise<void>;
  focusInput: () => void;
};

type ItemSnapshot = {
  value: DocValue;
  quantity?: number;
  transferQuantity?: number;
  setRate?: Money;
  setItemDiscountAmount?: boolean;
  itemDiscountAmount?: Money;
  itemDiscountPercent?: number;
};

export default defineComponent({
  name: 'KeyboardModal',
  components: { Button, Modal, NumericKeypad },
  props: {
    modalStatus: Boolean,
    selectedItemRow: { type: SalesInvoiceItem, required: true },
    selectedItemField: { type: String, default: '' },
  },
  emits: ['toggleModal'],
  setup() {
    return { sinvDoc: inject('sinvDoc') as SalesInvoice };
  },
  data() {
    return {
      selectedValue: '',
      validationError: '',
      saving: false,
    };
  },
  computed: {
    fieldLabel(): string {
      return (
        (this.selectedItemRow?.fieldMap[this.selectedItemField]?.label as string) ||
        this.t`Value`
      );
    },
    modalTitle(): string {
      return this.t`Edit ${this.fieldLabel}`;
    },
    isQuantityField(): boolean {
      return ['quantity', 'transferQuantity'].includes(this.selectedItemField);
    },
    allowNegative(): boolean {
      return this.isQuantityField && !!this.selectedItemRow?.isReturn;
    },
    keypad(): NumericKeypadRef | undefined {
      return this.$refs.keypad as NumericKeypadRef | undefined;
    },
  },
  watch: {
    async modalStatus(isOpen) {
      if (!isOpen) {
        return;
      }

      this.loadSelectedValue();
      await this.$nextTick();
      await this.keypad?.begin();
    },
  },
  async mounted() {
    if (!this.modalStatus) {
      return;
    }

    this.loadSelectedValue();
    await this.$nextTick();
    await this.keypad?.begin();
  },
  methods: {
    async saveSelectedItem() {
      if (this.saving) {
        return;
      }

      const value = this.getValidatedValue();
      if (value === null) {
        this.keypad?.focusInput();
        return;
      }

      const row = this.selectedItemRow;
      const fieldname = this.selectedItemField;
      const snapshot = this.captureSnapshot(row, fieldname);
      this.saving = true;

      try {
        await this.applyValue(row, fieldname, value);
        await this.sinvDoc.runFormulas();
        this.$emit('toggleModal', 'Keyboard');
      } catch (error) {
        await this.rollback(row, fieldname, snapshot);
        this.validationError = getErrorMessage(error as Error, row);
        this.keypad?.focusInput();
      } finally {
        this.saving = false;
      }
    },
    getValidatedValue(): number | null {
      this.validationError = '';
      const value = parseNumericDraft(this.selectedValue);
      if (value === null) {
        this.validationError = this.t`Enter a valid number.`;
        return null;
      }

      if (!this.allowNegative && value < 0) {
        this.validationError = this.t`Value cannot be negative.`;
        return null;
      }

      if (this.isQuantityField && value === 0) {
        this.validationError = this.t`Quantity must be greater than zero.`;
        return null;
      }

      if (this.selectedItemField === 'itemDiscountPercent' && value > 100) {
        this.validationError = this.t`Discount percent cannot be greater than 100.`;
        return null;
      }

      if (this.isQuantityField && this.selectedItemRow?.isReturn) {
        return -Math.abs(value);
      }

      return value;
    },
    async applyValue(
      row: SalesInvoiceItem,
      fieldname: string,
      value: number
    ) {
      if (row.fieldMap[fieldname]?.fieldtype === ModelNameEnum.Currency) {
        await this.applyCurrencyValue(row, fieldname, value);
        return;
      }

      if (fieldname === 'itemDiscountPercent') {
        await row.set('setItemDiscountAmount', false);
        await row.set('itemDiscountPercent', value);
        return;
      }

      if (this.isQuantityField) {
        await row.set(fieldname, value);
        await validateQty(this.sinvDoc, row, this.getMatchingItems(row));
        return;
      }

      throw new Error(this.t`This field cannot be edited with the keypad.`);
    },
    async applyCurrencyValue(
      row: SalesInvoiceItem,
      fieldname: string,
      value: number
    ) {
      const moneyValue = this.fyo.pesa(value);
      if (fieldname === 'rate') {
        await row.set('rate', moneyValue);
        row.setRate = moneyValue;
        return;
      }

      if (fieldname === 'itemDiscountAmount') {
        await row.set('setItemDiscountAmount', true);
        await row.set('itemDiscountAmount', moneyValue);
        return;
      }

      throw new Error(this.t`This currency field cannot be edited with the keypad.`);
    },
    getMatchingItems(row: SalesInvoiceItem): InvoiceItem[] {
      return (
        this.sinvDoc.items?.filter(
          (item: InvoiceItem) => item.item === row.item && !item.isFreeItem
        ) ?? []
      );
    },
    captureSnapshot(row: SalesInvoiceItem, fieldname: string): ItemSnapshot {
      return {
        value: row[fieldname] as DocValue,
        quantity: row.quantity,
        transferQuantity: row.transferQuantity,
        setRate: row.setRate as Money | undefined,
        setItemDiscountAmount: row.setItemDiscountAmount,
        itemDiscountAmount: row.itemDiscountAmount,
        itemDiscountPercent: row.itemDiscountPercent,
      };
    },
    async rollback(
      row: SalesInvoiceItem,
      fieldname: string,
      snapshot: ItemSnapshot
    ) {
      try {
        await row.set(fieldname, snapshot.value);
        row.quantity = snapshot.quantity;
        row.transferQuantity = snapshot.transferQuantity;
        row.setRate = snapshot.setRate;
        await row.set('setItemDiscountAmount', snapshot.setItemDiscountAmount);
        await row.set('itemDiscountAmount', snapshot.itemDiscountAmount);
        await row.set('itemDiscountPercent', snapshot.itemDiscountPercent);
        await this.sinvDoc.runFormulas();
      } catch {
        // Keep the original error visible if rollback recalculation also fails.
      }
    },
    loadSelectedValue() {
      const value = this.selectedItemRow?.[this.selectedItemField];
      this.selectedValue = value?.toString() ?? '';
      this.validationError = '';
      this.saving = false;
    },
    closeKeyboardModal() {
      this.validationError = '';
      this.$emit('toggleModal', 'Keyboard');
    },
  },
});
</script>
