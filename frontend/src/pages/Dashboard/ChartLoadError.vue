<template>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="text-sm-medium text-ink-red-7">{{ t`Failed to load` }}</span>
    <FrappeButton size="sm" :label="t`Try again`" @click="$emit('retry')" />
  </div>
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';

/** A dashboard chart's `#error` state: Books' copy plus a retry. */
defineEmits<{ retry: [] }>();
</script>
