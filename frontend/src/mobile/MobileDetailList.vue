<template>
  <dl>
    <div
      v-for="detail in details"
      :key="detail.key"
      class="flex min-h-11 items-center justify-between gap-4 border-b border-outline-gray-1 py-2 text-md"
    >
      <dt class="shrink-0 text-ink-gray-5">{{ detail.label }}</dt>
      <dd
        class="min-w-0 text-end tabular-nums text-ink-gray-8 [overflow-wrap:anywhere]"
        :class="{ 'text-md-semibold': detail.emphasis }"
        dir="auto"
      >
        {{ detail.value }}
      </dd>
    </div>
  </dl>
</template>
<script setup lang="ts">
export interface Detail {
  key: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

/** Label and value pairs, as in the report and table row detail sheets. */
defineProps<{ details: Detail[] }>();
</script>
