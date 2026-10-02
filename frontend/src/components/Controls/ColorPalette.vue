<template>
  <div>
    <div class="grid grid-cols-5 gap-2">
      <!-- The selected outline's offset gap shows the popover or sheet behind. -->
      <button
        v-for="color in colors"
        :key="color.value"
        type="button"
        class="rounded-1 border border-outline-gray-2"
        :class="[
          isMobile ? 'size-10' : 'size-7',
          {
            'outline outline-2 outline-offset-2 outline-[color:var(--outline-gray-5)]':
              isSelected(color.value),
          },
        ]"
        :style="{ backgroundColor: color.value }"
        :title="color.label"
        :aria-label="color.label"
        :aria-pressed="isSelected(color.value)"
        @click="$emit('select', color.value)"
      />
    </div>

    <div
      class="mt-3 flex items-center gap-2 rounded-4 border border-outline-gray-2 bg-surface-gray-1 p-1.5"
    >
      <input
        type="color"
        class="color-swatch h-7 w-7 flex-shrink-0 cursor-pointer"
        :value="value"
        :title="t`Choose color`"
        :aria-label="t`Choose color`"
        @input="onInput"
      />
      <FrappeTextInput
        class="min-w-0 flex-1 font-mono uppercase"
        :model-value="value"
        :placeholder="t`Custom Hex`"
        :aria-label="t`Custom Hex`"
        @update:model-value="(hex: string) => $emit('select', hex)"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { TextInput as FrappeTextInput } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

const props = defineProps<{
  colors: { label: string; value: string }[];
  value: string;
}>();
const emit = defineEmits<{ select: [value: string] }>();

function isSelected(color: string) {
  return props.value.toLowerCase() === color.toLowerCase();
}

function onInput(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    emit('select', event.target.value);
  }
}
</script>

<style scoped>
.color-swatch {
  appearance: none;
  border: 0;
  border-radius: 0.375rem;
  overflow: hidden;
  padding: 0;
}

.color-swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-swatch::-webkit-color-swatch,
.color-swatch::-moz-color-swatch {
  border: 0;
}
</style>
