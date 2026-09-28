<template>
  <FrappeBottomSheet v-model:open="isOpen" :title="title">
    <div
      :role="actions ? undefined : 'listbox'"
      :aria-label="actions ? undefined : title"
      class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        :role="actions ? undefined : 'option'"
        :aria-selected="actions ? undefined : option.value === value"
        class="flex h-[52px] items-center gap-3 rounded-5 px-3 text-start text-lg text-ink-gray-8 active:bg-surface-gray-2"
        @click="select(option.value)"
      >
        <span
          v-if="option.icon"
          :class="option.icon"
          class="size-[18px] shrink-0"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
        <span
          v-if="!actions && option.value === value"
          class="lucide-check size-[18px] shrink-0 text-ink-gray-9"
          aria-hidden="true"
        />
      </button>
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import { BottomSheet as FrappeBottomSheet } from 'frappe-ui';

export interface SheetOption {
  label: string;
  value: string | number;
  icon?: string;
}

defineProps<{
  title: string;
  options: SheetOption[];
  value?: string | number | null;
  /** The options are actions to run, not values to pick. */
  actions?: boolean;
}>();

const emit = defineEmits<{ select: [value: string | number] }>();
const isOpen = defineModel<boolean>('open', { required: true });

function select(value: string | number) {
  isOpen.value = false;
  emit('select', value);
}
</script>
