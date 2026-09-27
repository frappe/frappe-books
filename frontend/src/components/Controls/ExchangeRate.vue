<template>
  <div
    class="flex items-center bg-surface-gray-1 border-outline-gray-1 rounded-4 text-sm p-1 border"
  >
    <div
      class="flex items-center gap-2 rounded-4 px-1 text-sm text-ink-gray-9"
      :class="disabled ? 'bg-surface-gray-2' : 'bg-surface-gray-1'"
    >
      <FrappeTextInput
        :model-value="fromValue"
        type="number"
        :aria-label="left"
        :disabled="disabled"
        :min="0"
        size="sm"
        variant="ghost"
        class="w-16 [&_input]:text-end"
        @update:model-value="setFromValue"
      />

      <span class="text-ink-gray-5">{{ left }}</span>
    </div>

    <p class="mx-1 text-ink-gray-6">=</p>

    <div
      class="flex items-center gap-2 rounded-4 px-1 text-sm text-ink-gray-9"
      :class="disabled ? 'bg-surface-gray-2' : 'bg-surface-gray-1'"
    >
      <FrappeTextInput
        type="number"
        :aria-label="right"
        :model-value="toValue"
        :disabled="disabled"
        :min="0"
        size="sm"
        variant="ghost"
        class="w-16 [&_input]:text-end"
        @change="rightChange"
      />
      <span class="text-ink-gray-5">{{ right }}</span>
    </div>

    <FrappeButton
      v-if="!disabled"
      theme="green"
      variant="subtle"
      size="xs"
      class="ms-1"
      icon="lucide-refresh-cw"
      :label="t`Swap currencies`"
      :tooltip="t`Swap currencies`"
      @click="swap"
    />
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { safeParseFloat } from 'utils/index';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeButton, FrappeTextInput },
  props: {
    disabled: { type: Boolean, default: false },
    fromCurrency: { type: String, default: 'USD' },
    toCurrency: { type: String, default: 'INR' },
    exchangeRate: { type: Number, default: 75 },
  },
  emits: ['change'],
  data() {
    return { fromValue: 1, isSwapped: false };
  },
  computed: {
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
    setFromValue(value: string) {
      this.fromValue = Math.max(safeParseFloat(value), 0);
    },
    swap() {
      this.isSwapped = !this.isSwapped;
    },
    rightChange(e: Event) {
      let value: string | number = 1;
      if (e.target instanceof HTMLInputElement) {
        value = e.target.value;
      }

      value = safeParseFloat(value);

      let exchangeRate = value / this.fromValue;
      if (this.isSwapped) {
        exchangeRate = this.fromValue / value;
      }

      this.$emit('change', exchangeRate);
    },
  },
});
</script>
