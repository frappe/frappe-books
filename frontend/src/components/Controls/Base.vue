<template>
  <ReadOnlyValue
    v-if="isReadOnly"
    :df="df"
    :value="value"
    :doc="doc"
    :border="border"
    :show-label="showLabel"
    :required="isRequired"
    :size="size"
    :text-right="textRight"
    :container-styles="containerStyles"
  />
  <FrappeTextInput
    v-else
    ref="input"
    spellcheck="false"
    :class="controlClasses"
    :type="inputType"
    :model-value="inputValue"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="inputPlaceholder"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :step="step"
    :max="isNumeric(df) ? df.maxvalue : undefined"
    :min="isNumeric(df) ? df.minvalue : undefined"
    :style="containerStyles"
    tabindex="0"
    @blur="onBlur"
    @focus="onFocus"
    @input="onInput"
  >
    <template v-if="isBarcodeField" #suffix>
      <BarcodeScanButton
        variant="ghost"
        size="sm"
        @scan="(code: string) => triggerChange(code)"
      />
    </template>
  </FrappeTextInput>
</template>
<script lang="ts">
import { FrappeDoc } from 'src/frappe/document';
import { TextInput as FrappeTextInput } from 'frappe-ui';
import { Field } from 'schemas/types';
import { isNumeric } from 'src/utils';
import { evaluateReadOnly, evaluateRequired } from 'src/utils/doc';
import { isMobile } from 'src/utils/viewport';
import { getIsNullOrUndef } from 'utils/index';
import { defineComponent, PropType } from 'vue';
import BarcodeScanButton from 'src/mobile/scan/BarcodeScanButton.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  name: 'Base',
  components: { BarcodeScanButton, FrappeTextInput, ReadOnlyValue },
  inject: {
    injectedDoc: {
      from: 'doc',
      default: undefined,
    },
  },
  props: {
    df: { type: Object as PropType<Field>, required: true },
    step: { type: Number, default: 1 },
    value: [String, Number, Boolean, Object],
    inputClass: [String, Array] as PropType<string | string[]>,
    border: { type: Boolean, default: false },
    size: { type: String, default: 'large' },
    placeholder: String,
    showLabel: { type: Boolean, default: false },
    containerStyles: { type: Object, default: () => ({}) },
    textRight: {
      type: [null, Boolean] as PropType<boolean | null>,
      default: null,
    },
    readOnly: {
      type: [null, Boolean] as PropType<boolean | null>,
      default: null,
    },
    required: {
      type: [null, Boolean] as PropType<boolean | null>,
      default: null,
    },
    /** Phones mark a field red only once it has an error. */
    invalid: { type: Boolean, default: false },
  },
  emits: ['focus', 'input', 'change'],
  computed: {
    isMobile(): boolean {
      return isMobile.value;
    },
    /** Phones scan barcodes with the camera. */
    isBarcodeField(): boolean {
      return this.isMobile && this.df.fieldname === 'barcode';
    },
    inputValue(): string | number {
      if (typeof this.value === 'number' || typeof this.value === 'string') {
        return this.value;
      }

      return this.value == null ? '' : String(this.value);
    },
    frappeSize(): 'sm' | 'md' | 'lg' {
      // 16px text on phones keeps iOS from zooming into a focused field.
      if (this.isMobile) {
        return 'lg';
      }

      return this.size === 'small' ? 'sm' : 'md';
    },
    frappeVariant(): 'outline' | 'ghost' | 'subtle' {
      if (!this.border) {
        return 'ghost';
      }

      return this.isMobile ? 'subtle' : 'outline';
    },
    controlClasses(): (string | string[])[] {
      const classes: (string | string[])[] = [];
      if (this.inputClass) {
        classes.push(this.inputClass);
      }
      if (this.textRight ?? isNumeric(this.df)) {
        // TextInput can't align its text (frappe/frappe-ui#1256).
        classes.push('[&_input]:text-end');
      }
      if (this.isMobile ? this.invalid : this.showMandatory) {
        // TextInput's `error` shows a message, not a border (frappe/frappe-ui#1252).
        classes.push('[&_[data-slot=control]]:border-outline-red-3');
      }
      return classes;
    },
    doc(): FrappeDoc | undefined {
      const doc = this.injectedDoc;

      if (doc instanceof FrappeDoc) {
        return doc;
      }

      return undefined;
    },
    inputType(): 'text' {
      return 'text';
    },
    inputPlaceholder(): string {
      return this.placeholder || this.df.placeholder || this.df.label;
    },
    showMandatory(): boolean {
      return this.isEmpty && this.isRequired;
    },
    isEmpty(): boolean {
      if (Array.isArray(this.value) && !this.value.length) {
        return true;
      }

      if (typeof this.value === 'string' && !this.value) {
        return true;
      }

      if (getIsNullOrUndef(this.value)) {
        return true;
      }

      return false;
    },
    isReadOnly(): boolean {
      if (typeof this.readOnly === 'boolean') {
        return this.readOnly;
      }

      return evaluateReadOnly(this.df, this.doc);
    },
    isRequired(): boolean {
      if (typeof this.required === 'boolean') {
        return this.required;
      }

      return evaluateRequired(this.df, this.doc);
    },
  },
  methods: {
    onBlur(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (this.isReadOnly) {
        return;
      }

      this.triggerChange(target.value);
    },
    onFocus(e: FocusEvent) {
      if (!this.isReadOnly) {
        this.$emit('focus', e);
      }
    },
    onInput(e: Event) {
      if (!this.isReadOnly) {
        this.$emit('input', e);
      }
    },
    focus(): void {
      this.getInputElement()?.focus();
    },
    getInputElement(): HTMLInputElement | HTMLTextAreaElement | null {
      const control = this.$refs.input as
        | HTMLInputElement
        | HTMLTextAreaElement
        | {
            inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
            $el?: HTMLElement;
          }
        | undefined;

      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement
      ) {
        return control;
      }

      return (
        control?.inputElement ??
        control?.$el?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input, textarea'
        ) ??
        null
      );
    },
    triggerChange(value: unknown): void {
      value = this.parse(value);

      if (value === '') {
        value = null;
      }

      this.$emit('change', value);
    },
    parse(value: unknown): unknown {
      return value;
    },
    isNumeric,
  },
});
</script>
