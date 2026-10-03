<template>
  <div class="grid gap-4" aria-busy="true" data-testid="form-skeleton">
    <span class="sr-only" role="status">{{ t`Loading` }}</span>
    <div v-for="width in labelWidths" :key="width" class="space-y-1.5">
      <FrappeSkeleton class="h-3.5 rounded-4" :style="{ width: `${width}px` }" />
      <FrappeSkeleton class="h-10 rounded-5 md:h-8 md:rounded-4" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { Skeleton as FrappeSkeleton } from 'frappe-ui';

/** Field rows that stand in for a form while its document loads. */
const labelWidths = [96, 120, 80, 140, 104, 88];
</script>
