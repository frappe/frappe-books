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
    inputmode="decimal"
    :class="controlClasses"
    :type="inputType"
    :model-value="displayValue"
    :label="showLabel ? df.label : undefined"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="inputPlaceholder"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :step="step"
    :style="containerStyles"
    tabindex="0"
    @blur="onBlur"
    @focus="onFocus"
    @input="onInput"
  />
</template>
<script lang="ts">
import type { Fyo } from 'fyo';
import { formatNumber, parseNumber } from 'fyo/utils/format';
import { TextInput as FrappeTextInput } from 'frappe-ui';
import { Money } from 'pesa';
import { getIsNullOrUndef, safeParsePesa } from 'utils/index';
import { defineComponent, nextTick } from 'vue';
import Float from './Float.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

/** An amount, or one typed as Desk reads it; null for text that is not a number. */
function toAmount(value: unknown, fyo: Fyo): Money | null {
  if (typeof value === 'string') {
    const number = parseNumber(value, fyo);
    return number === null ? null : fyo.pesa(number);
  }

  return getIsNullOrUndef(value) ? null : safeParsePesa(value, fyo);
}

export default defineComponent({
  name: 'Currency',
  components: { FrappeTextInput, ReadOnlyValue },
  extends: Float,
  emits: ['input', 'focus'],
  props: {
    focusInput: Boolean,
  },
  data() {
    return { isFocused: false };
  },
  computed: {
    // A text input, as Frappe's desk uses, takes grouped numbers and arithmetic.
    inputType(): 'text' {
      return 'text';
    },
    /** The amount as Desk formats it for input, or the bare number while it is typed. */
    displayValue(): string {
      const amount = toAmount(this.value, this.fyo);
      if (amount === null) {
        return '';
      }

      return this.isFocused ? amount.round() : formatNumber(amount, this.fyo);
    },
  },
  mounted() {
    if (this.focusInput) {
      nextTick(() => {
        this.focus();
      });
    }
  },
  methods: {
    onFocus(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      this.isFocused = true;
      // Select the bare number once it replaces the formatted amount.
      nextTick(() => target.select());
      this.$emit('focus', e);
    },
    parse(value: unknown): Money | null {
      return toAmount(value, this.fyo);
    },
    onBlur(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      this.isFocused = false;
      this.triggerChange(target.value);
    },
  },
});
</script>
