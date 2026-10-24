<template>
  <div
    v-if="isMobile"
    class="flex min-w-0 flex-col gap-1.5"
    :style="containerStyles"
  >
    <span v-if="showLabel" class="text-sm text-ink-gray-6">{{ df.label }}</span>
    <!-- Frappe keeps colour for state, so links are marked by the icon. -->
    <button
      v-if="linked"
      class="-mx-2 flex min-h-9 max-w-full items-center gap-1.5 self-start rounded-4 px-2 text-start text-lg text-ink-gray-8 active:bg-surface-gray-2"
      @click="$emit('open')"
    >
      <span class="min-w-0" :class="isAccessory ? 'break-words' : 'truncate'">{{
        displayText
      }}</span>
      <FrappeIcon
        icon="lucide-arrow-up-right"
        class="size-4 shrink-0 text-ink-gray-5"
      />
    </button>
    <span v-else class="min-h-6 break-words text-lg" :class="textClass">{{
      displayText
    }}</span>
  </div>
  <!-- Accessory mode's form fields read as text: no input surface, nothing to focus. -->
  <div
    v-else-if="isAccessory && showLabel"
    class="flex min-w-0 flex-col gap-1.5"
    :style="containerStyles"
  >
    <FrappeFormLabel :label="df.label" />
    <button
      v-if="linked"
      class="self-start break-words text-start text-base text-ink-gray-8 underline decoration-outline-gray-3 underline-offset-2 hover:decoration-current"
      @click="$emit('open')"
    >
      {{ displayText }}
    </button>
    <p v-else class="min-h-5 break-words text-base" :class="textClass">
      {{ displayText }}
    </p>
  </div>
  <FrappeTextInput
    v-else
    :model-value="displayText"
    :label="showLabel ? df.label : undefined"
    :description="showLabel ? df.sub_label : undefined"
    :required="required"
    :size="frappeSize"
    :variant="border ? 'outline' : 'ghost'"
    :class="controlClasses"
    :style="containerStyles"
    :title="displayText"
    disabled
  >
    <template v-if="$slots.trailing" #suffix>
      <!-- TextInput reserves 8/10px for suffixes; 24px actions need 2/4px. -->
      <div
        class="inline-flex items-center"
        :class="{ '-me-1.5': trailingActions }"
      >
        <slot name="trailing"></slot>
      </div>
    </template>
  </FrappeTextInput>
</template>

<script lang="ts">
import type { FrappeDoc } from 'src/frappe/document';
import {
  FormLabel as FrappeFormLabel,
  Icon as FrappeIcon,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import type { Money } from 'pesa';
import { Field, NumberField } from 'schemas/types';
import { isAccessoryMode } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { isMobile } from 'src/utils/viewport';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'ReadOnlyValue',
  components: { FrappeFormLabel, FrappeIcon, FrappeTextInput },
  props: {
    df: { type: Object as PropType<Field>, required: true },
    value: {
      type: [String, Number, Boolean, Object, Array] as PropType<
        string | number | boolean | Record<string, unknown> | unknown[] | null
      >,
      default: null,
    },
    displayValue: String,
    doc: { type: Object as PropType<FrappeDoc> },
    border: { type: Boolean, default: false },
    showLabel: { type: Boolean, default: false },
    trailingActions: { type: Boolean, default: false },
    /** Phones show the value as a tappable link that emits `open`. */
    linked: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    size: { type: String, default: 'large' },
    textRight: {
      type: [null, Boolean] as PropType<boolean | null>,
      default: null,
    },
    containerStyles: { type: Object, default: () => ({}) },
  },
  emits: ['open'],
  setup() {
    return { isMobile, isAccessory: isAccessoryMode() };
  },
  computed: {
    displayText(): string {
      if (String(this.df.fieldtype) === 'Secret') {
        return this.value ? '••••••••' : '—';
      }

      const formatted =
        this.displayValue ?? this.formatValue(this.value, this.df, this.doc);
      return formatted || this.emptyText;
    },
    /** Accessory mode's form fields read "Not set"; table cells keep the dash. */
    emptyText(): string {
      const isField = this.isMobile || this.showLabel;
      return this.isAccessory && isField ? this.t`Not set` : '—';
    },
    textClass(): string {
      if (this.isAccessory && this.displayText === this.emptyText) {
        return 'text-ink-gray-4';
      }

      return this.isRed ? 'text-ink-red-6' : 'text-ink-gray-8';
    },
    frappeSize(): 'sm' | 'md' {
      return this.size === 'small' ? 'sm' : 'md';
    },
    controlClasses(): string[] {
      const classes = ['[&_input]:cursor-not-allowed', '[&_input]:text-base'];
      if (this.textRight ?? isNumeric(this.df)) {
        // TextInput can't align its text (frappe/frappe-ui#1256).
        classes.push('[&_input]:text-end');
      }
      if (isNumeric(this.df)) {
        classes.push('[&_input]:tabular-nums');
      }
      if (this.isRed) {
        classes.push('[&_input]:!text-ink-red-6');
      }
      return classes;
    },
    /** A negative amount its field marks in red, like a POS closing difference. */
    isRed(): boolean {
      if (!(this.df as NumberField).negativeInRed) {
        return false;
      }

      const value = this.value as Money | number | null;
      return typeof value === 'number' ? value < 0 : !!value?.isNegative?.();
    },
  },
  methods: {
    formatValue(value: unknown, field: Field, doc?: FrappeDoc): string {
      return fyo.format(value, field, doc);
    },
  },
});
</script>
