<template>
  <div>
    <div class="grid grid-cols-5 gap-2">
      <FrappeButton
        v-for="color in colors"
        :key="color.value"
        variant="outline"
        size="sm"
        class="!min-w-0 !p-0"
        :class="[
          isMobile ? '!size-10' : '!size-7',
          value.toLowerCase() === color.value.toLowerCase()
            ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-850'
            : '',
        ]"
        :style="{ backgroundColor: color.value }"
        :title="color.label"
        :aria-label="color.label"
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
import {
  Button as FrappeButton,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

defineProps<{ colors: { label: string; value: string }[]; value: string }>();
const emit = defineEmits<{ select: [value: string] }>();

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
