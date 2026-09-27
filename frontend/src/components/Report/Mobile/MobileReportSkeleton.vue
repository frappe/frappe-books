<template>
  <div aria-busy="true" data-testid="report-skeleton">
    <span class="sr-only" role="status">{{ t`Loading` }}</span>
    <div
      v-for="width in labelWidths"
      :key="width"
      class="grid content-center items-center gap-x-2 gap-y-2.5 border-b border-outline-gray-1 px-4"
      :style="{ gridTemplateColumns, height: `${height}px` }"
    >
      <span :class="bar" :style="{ width: `${width}px` }" />
      <span v-for="(_, index) in values" :key="index" :class="bar" />
      <template v-if="lines === 2">
        <span :class="bar" :style="{ width: `${width - 40}px` }" />
        <span v-for="(_, index) in values" :key="index" :class="bar" />
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Widths of the value columns. */
  values: number[];
  height: number;
  lines: 1 | 2;
}>();

const bar = 'h-[13px] max-w-full rounded-[6px] bg-surface-gray-2';
const labelWidths = [150, 120, 170, 110, 140];

const gridTemplateColumns = computed(() =>
  ['minmax(0, 1fr)', ...props.values.map((width) => `${width}px`)].join(' ')
);
</script>
