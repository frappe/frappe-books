<template>
  <FrappeBottomSheet v-model:open="isOpen" :title="title">
    <div
      :role="actions ? undefined : 'listbox'"
      :aria-label="actions ? undefined : title"
      class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <MobileSheetRow
        v-for="option in options"
        :key="String(option.value)"
        :role="actions ? undefined : 'option'"
        :aria-selected="actions ? undefined : option.value === value"
        :label="option.label"
        :icon="option.icon"
        :checked="!actions && option.value === value"
        @click="select(option.value)"
      />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import { BottomSheet as FrappeBottomSheet } from 'frappe-ui';
import MobileSheetRow from './MobileSheetRow.vue';

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
