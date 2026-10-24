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
  <div v-else-if="isMobile" :style="containerStyles">
    <MobileFieldTrigger
      :label="showLabel ? df.label : undefined"
      :required="isRequired"
      :placeholder="inputPlaceholder"
      :display-value="displayTime"
      :invalid="invalid || !!typedError"
      @click="sheetOpen = true"
    >
      <template #prefix>
        <span
          class="lucide-clock size-4 shrink-0 text-ink-gray-5"
          aria-hidden="true"
        />
      </template>
    </MobileFieldTrigger>
    <FrappeErrorMessage class="mt-1.5" :message="typedError" />
    <FrappeBottomSheet v-model:open="sheetOpen" :title="df.label">
      <div class="flex flex-col gap-3 px-4">
        <FrappeTextInput
          size="lg"
          variant="subtle"
          :model-value="displayTime"
          :placeholder="inputPlaceholder"
          :aria-label="df.label"
          :error="typedError"
          @blur="(e: FocusEvent) => commitTyped(e.target as HTMLInputElement)"
          @keydown.enter="
            (e: KeyboardEvent) => (e.target as HTMLElement).blur()
          "
        >
          <template #prefix>
            <span
              class="lucide-clock size-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FrappeTextInput>
        <div
          ref="slotList"
          role="listbox"
          :aria-label="df.label"
          class="-mx-2 flex flex-col pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <MobileSheetRow
            v-for="slot in slots"
            :key="slot.value"
            role="option"
            :aria-selected="slot.value === pickedSlot"
            :label="slot.label"
            :checked="slot.value === pickedSlot"
            @click="pick(slot.value)"
          />
        </div>
      </div>
    </FrappeBottomSheet>
  </div>
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
  BottomSheet as FrappeBottomSheet,
  ErrorMessage as FrappeErrorMessage,
  TextInput as FrappeTextInput,
  TimePicker as FrappeTimePicker,
} from 'frappe-ui';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileSheetRow from 'src/mobile/MobileSheetRow.vue';
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

/** A Time field: typed, or picked from half-hourly slots, in the user's time format. */
export default defineComponent({
  name: 'Time',
  components: {
    FrappeBottomSheet,
    FrappeErrorMessage,
    FrappeTextInput,
    FrappeTimePicker,
    MobileFieldTrigger,
    MobileSheetRow,
    ReadOnlyValue,
  },
  extends: Base,
  data() {
    return {
      sheetOpen: false,
      typedError: '',
      slots: getTimeSlots().map((slot) => ({
        value: slot,
        label: formatTime(slot),
      })),
    };
  },
  watch: {
    /** The sheet opens on the picked slot. */
    async sheetOpen(open: boolean) {
      await this.$nextTick();
      const list = this.$refs.slotList as HTMLElement | undefined;
      if (open) {
        list
          ?.querySelector('[aria-selected="true"]')
          ?.scrollIntoView({ block: 'center' });
      }
    },
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
    pickedSlot(): string {
      return this.timeValue.slice(0, 5);
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
    pick(slot: string) {
      this.commit(slot);
      this.sheetOpen = false;
    },
    commitTyped(input: HTMLInputElement) {
      const text = input.value.trim();
      const time = parseTime(text);
      if (text && !time) {
        this.typedError = this.timeError();
        return;
      }

      this.commit(time);
      this.sheetOpen = false;
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
