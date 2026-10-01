<template>
  <FrappeItemListRow as="button" type="button" size="lg" class="text-start">
    <template v-if="icon" #prefix>
      <span :class="icon" class="size-5 text-ink-gray-5" aria-hidden="true" />
    </template>
    <span class="block truncate text-ink-gray-8">{{ label }}</span>
    <template v-if="checked || count" #suffix>
      <span
        v-if="checked"
        class="lucide-check size-4 text-ink-gray-7"
        aria-hidden="true"
      />
      <FrappeBadge v-else variant="ghost" :label="String(count)" />
    </template>
  </FrappeItemListRow>
</template>
<script setup lang="ts">
import {
  Badge as FrappeBadge,
  ItemListRow as FrappeItemListRow,
} from 'frappe-ui';

/** A bottom sheet row: an icon, a label, and a check or a count. */
defineProps<{
  label: string;
  icon?: string;
  checked?: boolean;
  count?: number;
}>();
</script>
