<template>
  <div class="flex flex-col items-center justify-center gap-3 px-8 text-center">
    <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5">
      <span :class="icon" class="size-6" aria-hidden="true" />
    </div>
    <p class="text-base text-ink-gray-7">{{ title }}</p>
    <p v-if="description" class="text-sm text-ink-gray-5">{{ description }}</p>
    <slot />
  </div>
</template>
<script setup lang="ts">
/** The frappe-ui empty state: a glyph, a title, a line and an action. */
defineProps<{ icon: string; title: string; description?: string }>();
</script>
