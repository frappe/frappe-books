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
    :container-styles="containerStyles"
  />
  <!-- Phones use the native picker, as dates do. -->
  <FrappeTextInput
    v-else-if="isMobile"
    ref="input"
    type="time"
    :step="hasSeconds ? 1 : 60"
    :model-value="nativeValue"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :class="controlClasses"
    :style="containerStyles"
    @update:model-value="(time: string) => commit(time || null)"
    @focus="onFocus"
  />
  <FrappeTimePicker
    v-else
    ref="input"
    :model-value="timeValue"
    :options="slots"
    :format="timeFormat"
    :label="showLabel ? df.label : undefined"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="inputPlaceholder"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :error="typedError"
    :class="controlClasses"
    :style="containerStyles"
    @change="(time: string) => commit(time || null)"
    @blur.capture="checkTyped"
    @keydown.enter.capture="checkTyped"
  >
    <template #prefix>
      <span class="lucide-clock size-4 text-ink-gray-5" aria-hidden="true" />
    </template>
  </FrappeTimePicker>
</template>

<script lang="ts">
import {
  TextInput as FrappeTextInput,
  TimePicker as FrappeTimePicker,
} from 'frappe-ui';
import {
  formatTime,
  getTimeFormat,
  getTimeSlots,
  parseTime,
  toTimeValue,
} from 'src/utils/time';
import { defineComponent } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

/** A Time field: typed, or picked from half-hourly slots, in the user's time format; phones use the native picker. */
export default defineComponent({
  name: 'Time',
  components: { FrappeTextInput, FrappeTimePicker, ReadOnlyValue },
  extends: Base,
  data() {
    return {
      typedError: '',
      slots: getTimeSlots().map((slot) => ({
        value: slot,
        label: formatTime(slot),
      })),
    };
  },
  computed: {
    timeFormat(): string {
      return getTimeFormat();
    },
    /** The value as `HH:mm:ss`, without the microseconds Frappe may keep. */
    timeValue(): string {
      return typeof this.value === 'string' && this.value
        ? toTimeValue(this.value)
        : '';
    },
    displayTime(): string {
      return this.timeValue && formatTime(this.timeValue);
    },
    hasSeconds(): boolean {
      return this.timeFormat.includes('ss');
    },
    /** The native input's value, to the minute unless the time format shows seconds. */
    nativeValue(): string {
      return this.hasSeconds ? this.timeValue : this.timeValue.slice(0, 5);
    },
    inputPlaceholder(): string {
      return this.placeholder || this.df.placeholder || this.t`Select time`;
    },
  },
  methods: {
    focus() {
      (this.$refs.input as { focus?: () => void } | undefined)?.focus?.();
    },
    commit(time: string | null) {
      this.typedError = '';
      const value = time && toTimeValue(time);
      if (value !== (this.timeValue || null)) {
        this.triggerChange(value);
      }
    },
    /** TimePicker puts back the last time over text it cannot read, and has no event for it, so the text is read before TimePicker sees it. */
    checkTyped(event: Event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      // Unchanged text, like the time put back after an Enter, keeps the message.
      const text = input.value.trim();
      if (text !== this.displayTime) {
        this.typedError = text && !parseTime(text) ? this.timeError() : '';
      }
    },
    timeError(): string {
      return this.t`Enter a time between 00:00 and 23:59`;
    },
  },
});
</script>
