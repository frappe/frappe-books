<template>
  <FrappeBottomSheet v-model:open="open" :title="title">
    <div
      class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      :role="isPicker ? 'listbox' : undefined"
      :aria-label="title"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="flex h-[52px] items-center gap-3 rounded-5 px-3 text-start text-lg text-ink-gray-8 active:bg-surface-gray-2"
        :role="isPicker ? 'option' : undefined"
        :aria-selected="isPicker ? option.value === selected : undefined"
        @click="choose(option.value)"
      >
        <FrappeIcon
          v-if="option.icon"
          :icon="option.icon"
          class="size-[18px] shrink-0"
        />
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
        <FrappeIcon
          v-if="isPicker && option.value === selected"
          icon="lucide-check"
          class="size-[18px] shrink-0"
        />
      </button>
    </div>
  </FrappeBottomSheet>
</template>
<script lang="ts">
export interface SheetOption {
  value: string;
  label: string;
  icon?: string;
}
</script>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Icon as FrappeIcon,
} from 'frappe-ui';
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  options: SheetOption[];
  /** Makes the sheet a picker that marks this value. */
  selected?: string;
}>();
const emit = defineEmits<{ select: [value: string] }>();
const open = defineModel<boolean>('open', { required: true });

const isPicker = computed(() => props.selected !== undefined);

function choose(value: string) {
  open.value = false;
  emit('select', value);
}
</script>
