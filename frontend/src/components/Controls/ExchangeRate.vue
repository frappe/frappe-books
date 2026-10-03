<template>
  <div :class="{ 'space-y-1.5': isMobile }">
    <FrappeFormLabel v-if="isMobile" :label="t`Exchange Rate`" />
    <div class="flex items-center gap-2" dir="ltr">
      <!-- TextInput can't align its text, so these inputs set [&_input] (frappe/frappe-ui#1256). -->
      <FrappeTextInput
        :model-value="fromValue"
        inputmode="decimal"
        :aria-label="left"
        :disabled="disabled"
        :min="0"
        :size="size"
        variant="subtle"
        :class="inputClass"
        @update:model-value="setFromValue"
      >
        <template #suffix>
          <span :class="suffixClass">{{ left }}</span>
        </template>
      </FrappeTextInput>
      <span class="text-ink-gray-6">=</span>
      <FrappeTextInput
        inputmode="decimal"
        :aria-label="right"
        :model-value="toValue"
        :disabled="disabled"
        :min="0"
        :size="size"
        variant="subtle"
        :class="inputClass"
        @change="rightChange"
      >
        <template #suffix>
          <span :class="suffixClass">{{ right }}</span>
        </template>
      </FrappeTextInput>
      <FrappeButton
        v-if="!disabled"
        :size="size"
        icon="lucide-arrow-left-right"
        :label="t`Swap currencies`"
        :tooltip="isMobile ? undefined : t`Swap currencies`"
        @click="swap"
      />
    </div>
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  FormLabel as FrappeFormLabel,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { parseNumber } from 'fyo/utils/format';
import { isMobile } from 'src/utils/viewport';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeButton, FrappeFormLabel, FrappeTextInput },
  props: {
    disabled: { type: Boolean, default: false },
    fromCurrency: { type: String, default: 'USD' },
    toCurrency: { type: String, default: 'INR' },
    exchangeRate: { type: Number, default: 75 },
  },
  emits: ['change'],
  setup() {
    return { isMobile };
  },
  data() {
    return { fromValue: 1, isSwapped: false };
  },
  computed: {
    /** Phones show the rate as a form field, desktop in the form header. */
    size(): 'sm' | 'lg' {
      return this.isMobile ? 'lg' : 'sm';
    },
    inputClass(): string {
      return this.isMobile
        ? 'min-w-0 flex-1 [&_input]:pe-12 [&_input]:text-end'
        : 'w-28 [&_input]:pe-10 [&_input]:text-end';
    },
    suffixClass(): string {
      return this.isMobile
        ? 'text-base text-ink-gray-5'
        : 'text-sm text-ink-gray-5';
    },
    toValue(): number | string {
      if (!this.exchangeRate) {
        return '';
      }

      return this.isSwapped
        ? this.fromValue / this.exchangeRate
        : this.exchangeRate * this.fromValue;
    },
    left(): string {
      if (this.isSwapped) {
        return this.toCurrency;
      }

      return this.fromCurrency;
    },
    right(): string {
      if (this.isSwapped) {
        return this.fromCurrency;
      }

      return this.toCurrency;
    },
  },
  methods: {
    // Rates are read as Frappe's desk reads numbers; text that is no number changes nothing.
    setFromValue(value: string) {
      const number = parseNumber(value, this.fyo);
      if (number !== null) {
        this.fromValue = Math.max(number, 0);
      }
    },
    swap() {
      this.isSwapped = !this.isSwapped;
    },
    rightChange(e: Event) {
      if (!(e.target instanceof HTMLInputElement)) {
        return;
      }

      const value = parseNumber(e.target.value, this.fyo);
      if (value === null) {
        e.target.value = String(this.toValue);
        return;
      }

      let exchangeRate = value / this.fromValue;
      if (this.isSwapped) {
        exchangeRate = this.fromValue / value;
      }

      this.$emit('change', exchangeRate);
    },
  },
});
</script>
