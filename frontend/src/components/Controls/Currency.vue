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
import { isPesa } from 'fyo/utils';
import { TextInput as FrappeTextInput } from 'frappe-ui';
import { Money } from 'pesa';
import { safeParsePesa } from 'utils/index';
import { defineComponent, nextTick } from 'vue';
import Float from './Float.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

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
    // A text input, as Frappe's desk uses, shows the formatted amount.
    inputType(): 'text' {
      return 'text';
    },
    /** The formatted amount, or the bare number while it is typed. */
    displayValue(): string {
      if (this.isFocused) {
        return this.round(this.value);
      }

      return this.fyo.format(this.parse(this.value), this.df, this.doc);
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
    round(v: unknown) {
      if (!isPesa(v)) {
        v = this.parse(v);
      }

      if (isPesa(v)) {
        return v.round();
      }

      return this.fyo.pesa(0).round();
    },
    parse(value: unknown): Money {
      return safeParsePesa(value, this.fyo);
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
