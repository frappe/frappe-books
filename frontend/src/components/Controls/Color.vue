<template>
  <ReadOnlyValue
    v-if="isReadOnly"
    :df="df"
    :value="value"
    :display-value="selectedColorLabel || undefined"
    :doc="doc"
    :border="border"
    :show-label="showLabel"
    :required="isRequired"
    :size="size"
    :container-styles="containerStyles"
  >
    <template v-if="value" #trailing>
      <span
        class="ms-2 size-3 shrink-0 rounded-1"
        :style="{ backgroundColor: normalizedColor }"
        aria-hidden="true"
      />
    </template>
  </ReadOnlyValue>
  <div v-else-if="isMobile" :style="containerStyles">
    <MobileFieldTrigger
      :label="showLabel ? df.label : undefined"
      :required="isRequired"
      :placeholder="inputPlaceholder"
      :display-value="value ? selectedColorLabel : ''"
      :invalid="invalid"
      icon="lucide-palette"
      @click="isSheetOpen = true"
    >
      <template v-if="value" #prefix>
        <span
          class="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
          :style="{ backgroundColor: normalizedColor }"
          aria-hidden="true"
        />
      </template>
    </MobileFieldTrigger>
    <FrappeBottomSheet v-model:open="isSheetOpen" :title="df.label">
      <ColorPalette
        class="px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
        :colors="colors"
        :value="normalizedColor"
        @select="setColorValue"
      />
    </FrappeBottomSheet>
  </div>
  <div v-else>
    <FrappeFormLabel
      v-if="showLabel"
      class="mb-1.5"
      :label="df.label"
      :required="isRequired"
    />
    <FrappePopover side="bottom" align="end">
      <template #trigger>
        <FrappeButton
          :variant="frappeVariant"
          :size="frappeSize"
          :aria-label="df.label"
          class="w-full text-base"
        >
          <template v-if="value" #prefix>
            <span
              class="size-3 rounded-1"
              :style="{ backgroundColor: normalizedColor }"
            />
          </template>
          <span v-if="value">{{ selectedColorLabel }}</span>
          <span v-else class="text-ink-gray-4">{{ inputPlaceholder }}</span>
          <template #suffix>
            <!-- Takes the free width, so the value sits at the start like other fields. -->
            <span class="flex-1" aria-hidden="true" />
          </template>
        </FrappeButton>
      </template>
      <ColorPalette
        class="w-48 p-3"
        :colors="colors"
        :value="normalizedColor"
        @select="setColorValue"
      />
    </FrappePopover>
  </div>
</template>

<script>
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  FormLabel as FrappeFormLabel,
  Popover as FrappePopover,
} from 'frappe-ui';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import Base from './Base.vue';
import ColorPalette from './ColorPalette.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default {
  name: 'Color',
  components: {
    ColorPalette,
    FrappeBottomSheet,
    FrappeFormLabel,
    FrappePopover,
    MobileFieldTrigger,
    ReadOnlyValue,
    FrappeButton,
  },
  extends: Base,
  data() {
    return { isSheetOpen: false };
  },
  computed: {
    colors() {
      if (Array.isArray(this.df.options) && this.df.options.length) {
        return this.df.options.filter(
          (color) => color && typeof color.value === 'string'
        );
      }

      return defaultColors;
    },
    normalizedColor() {
      if (typeof this.value !== 'string') {
        return '#000000';
      }

      const value = this.value.startsWith('#') ? this.value : `#${this.value}`;
      return isValidColor(value) ? value : '#000000';
    },
    selectedColorLabel() {
      const color = this.colors.find(
        (candidate) =>
          candidate.value.toLowerCase() === this.normalizedColor.toLowerCase()
      );
      return color ? color.label : this.value;
    },
  },
  methods: {
    setColorValue(value) {
      if (typeof value !== 'string') {
        return;
      }

      if (!value.startsWith('#')) {
        value = '#' + value;
      }

      if (isValidColor(value)) {
        this.triggerChange(value);
      }
    },
  },
};

const defaultColors = [
  { label: 'Red', value: '#f98080' },
  { label: 'Orange', value: '#fbbf70' },
  { label: 'Yellow', value: '#fde047' },
  { label: 'Green', value: '#86efac' },
  { label: 'Teal', value: '#5eead4' },
  { label: 'Blue', value: '#60a5fa' },
  { label: 'Indigo', value: '#818cf8' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
  { label: 'Black', value: '#000000' },
];

function isValidColor(value) {
  return /^#[0-9A-F]{6}$/i.test(value);
}
</script>
