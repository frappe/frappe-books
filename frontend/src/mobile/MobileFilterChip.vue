<template>
  <FrappeButton
    size="md"
    :label="removeLabel ?? t`Remove filter ${label ?? value}`"
  >
    <span v-if="label" class="text-ink-gray-5">{{ label }}</span>
    {{ value }}
    <template #suffix>
      <span class="lucide-x size-4 text-ink-gray-5" aria-hidden="true" />
    </template>
  </FrappeButton>
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';

/** An applied filter, or another removable value, as a button that removes it. */
defineProps<{ value: string; label?: string; removeLabel?: string }>();
</script>
