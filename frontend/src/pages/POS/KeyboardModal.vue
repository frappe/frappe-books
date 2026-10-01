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

    <template #actions="{ size }">
      <FrappeButton
        :size="size"
        class="min-w-24"
        :disabled="saving"
        @click="closeKeyboardModal"
        >{{ t`Cancel` }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        :disabled="saving"
        :loading="saving"
        @click="saveSelectedItem"
        >{{ t`Save` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import { FieldTypeEnum } from 'schemas/types';
import Modal from 'src/components/POS/POSDialog.vue';
import NumericKeypad from 'src/components/POS/NumericKeypad.vue';
import { parseNumericDraft } from 'src/components/POS/numericKeypad';
import { getErrorMessage } from 'src/utils';
import { POSRowField, setPOSRowValue } from 'src/utils/pos';
import { defineComponent } from 'vue';

type NumericKeypadRef = {
  begin: () => Promise<void>;
  focusInput: () => void;
};

export default defineComponent({
  name: 'KeyboardModal',
  components: { FrappeButton, Modal, NumericKeypad },
  props: {
    modalStatus: Boolean,
    selectedItemRow: { type: SalesInvoiceItem, required: true },
    selectedItemField: { type: String, default: '' },
  },
  emits: ['toggleModal'],
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
    allowNegative(): boolean {
      const isQuantity = ['quantity', 'transfer_quantity'].includes(
        this.selectedItemField
      );
      return isQuantity && !!this.selectedItemRow?.isReturn;
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
      const field = this.selectedItemField as POSRowField;
      const isCurrency =
        row.fieldMap[field]?.fieldtype === FieldTypeEnum.Currency;
      this.saving = true;
      try {
        await setPOSRowValue(row, field, isCurrency ? this.fyo.pesa(value) : value);
        this.$emit('toggleModal', 'Keyboard');
      } catch (error) {
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

      if (this.selectedItemField === 'item_discount_percent' && value > 100) {
        this.validationError = this.t`Discount percent cannot be greater than 100.`;
        return null;
      }

      return value;
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
