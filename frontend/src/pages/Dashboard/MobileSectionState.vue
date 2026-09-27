<template>
  <div
    v-if="hasFailed"
    class="flex flex-col items-center justify-center gap-1 text-center"
  >
    <p class="text-base text-ink-gray-6">{{ t`Failed to load` }}</p>
    <FrappeButton
      variant="ghost"
      :label="t`Try again`"
      @click="$emit('retry')"
    />
  </div>
  <div v-else aria-busy="true">
    <slot>
      <div class="h-full rounded-5 bg-surface-gray-1" />
    </slot>
  </div>
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';

defineProps<{ hasFailed: boolean }>();
defineEmits<{ retry: [] }>();
</script>
