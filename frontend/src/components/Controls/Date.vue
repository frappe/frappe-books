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
    v-else-if="isMobile"
    ref="input"
    :type="nativeType"
    :model-value="nativeValue"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :class="controlClasses"
    :style="containerStyles"
    @update:model-value="onNativeChange"
    @focus="onFocus"
  />
  <component
    v-else
    :is="pickerComponent"
    ref="input"
    :model-value="inputValue"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="inputPlaceholder"
    :required="isRequired"
    :clearable="true"
    :format="frappeDateFormat"
    :size="frappeSize"
    :variant="frappeVariant"
    :class="controlClasses"
    :style="containerStyles"
    side="bottom"
    align="start"
    @change="onPickerChange"
    @focus="onFocus"
  />
</template>

<script lang="ts">
import { DatePicker, DateTimePicker, TextInput } from 'frappe-ui';
import { DateTime } from 'luxon';
import { defineComponent } from 'vue';
import Base from './Base.vue';
import { getDatePickerFormat } from './datePickerFormat';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  name: 'Date',
  components: {
    FrappeDatePicker: DatePicker,
    FrappeDateTimePicker: DateTimePicker,
    FrappeTextInput: TextInput,
    ReadOnlyValue,
  },
  extends: Base,
  emits: ['input', 'focus'],
  computed: {
    pickerComponent(): string {
      return 'FrappeDatePicker';
    },
    /** Phones use the native picker. */
    nativeType(): 'date' | 'datetime-local' {
      return 'date';
    },
    nativeValue(): string {
      return this.inputValue;
    },
    inputValue(): string {
      const date = this.toDateTime(this.value);
      return date?.isValid ? date.toFormat('yyyy-MM-dd') : '';
    },
    frappeDateFormat(): string {
      return getDatePickerFormat();
    },
  },
  methods: {
    toDateTime(value: unknown): DateTime | null {
      if (value instanceof Date) {
        return DateTime.fromJSDate(value);
      }
      if (typeof value === 'string') {
        return DateTime.fromISO(value.replace(' ', 'T'));
      }

      return null;
    },
    onNativeChange(value: string) {
      this.onPickerChange(value);
    },
    onPickerChange(value: string) {
      if (!value) {
        this.triggerChange(null);
        return;
      }

      const date = DateTime.fromISO(value.replace(' ', 'T'));
      this.triggerChange(date.isValid ? date.toJSDate() : null);
    },
    focus(): void {
      const control = this.$refs.input as { open?: () => void } | undefined;
      control?.open?.();
    },
    getInputElement(): null {
      return null;
    },
  },
});
</script>
