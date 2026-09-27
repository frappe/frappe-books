<template>
  <div class="min-w-0 space-y-1.5">
    <FrappeFormLabel v-if="label" :label="label" :required="required" />
    <button
      type="button"
      class="flex h-10 w-full items-center gap-2 rounded-5 border bg-surface-gray-2 px-3 text-start text-lg active:bg-surface-gray-3"
      :class="invalid ? 'border-outline-red-3' : 'border-transparent'"
      :aria-label="label ? undefined : placeholder"
      @click="$emit('click')"
    >
      <slot name="prefix" />
      <span
        class="min-w-0 flex-1 truncate"
        :class="displayValue ? 'text-ink-gray-8' : 'text-ink-gray-4'"
      >
        {{ displayValue || placeholder }}
      </span>
      <span
        :class="icon"
        class="size-4 shrink-0 text-ink-gray-5"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
<script setup lang="ts">
import { FormLabel as FrappeFormLabel } from 'frappe-ui';

withDefaults(
  defineProps<{
    label?: string;
    required?: boolean;
    placeholder?: string;
    displayValue?: string;
    invalid?: boolean;
    icon?: string;
  }>(),
  { icon: 'lucide-chevrons-up-down' }
);

defineEmits<{ click: [] }>();
</script>
