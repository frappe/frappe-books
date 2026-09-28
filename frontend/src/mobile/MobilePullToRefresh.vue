<template>
  <div ref="root" :aria-busy="isRefreshing">
    <div
      class="flex items-center justify-center overflow-hidden text-ink-gray-5"
      :class="isSwiping ? '' : 'transition-[height] duration-200'"
      :style="{ height: `${indicatorHeight}px` }"
    >
      <FrappeSpinner v-if="isRefreshing" size="lg" />
      <span
        v-else-if="indicatorHeight"
        aria-hidden="true"
        class="lucide-arrow-down size-5 transition-transform"
        :class="isReady ? 'rotate-180' : ''"
      />
    </div>
    <slot />
  </div>
</template>
<script setup lang="ts">
import { useSwipe } from '@vueuse/core';
import { Spinner as FrappeSpinner, shellScrollContainer } from 'frappe-ui';
import { computed, ref } from 'vue';

const props = defineProps<{ refresh: () => Promise<unknown> }>();

const TRIGGER_HEIGHT = 56;
const REFRESHING_HEIGHT = 44;

const root = ref<HTMLElement | null>(null);
const isRefreshing = ref(false);
const startedAtTop = ref(false);

const { isSwiping, lengthY } = useSwipe(root, {
  threshold: 10,
  onSwipeStart() {
    startedAtTop.value = (shellScrollContainer.value?.scrollTop ?? 0) <= 0;
  },
  onSwipeEnd() {
    if (isReady.value) void startRefresh();
  },
});

// Half the finger's travel, so the indicator trails the pull.
const pullHeight = computed(() =>
  isSwiping.value && startedAtTop.value ? Math.max(0, -lengthY.value) / 2 : 0
);
const isReady = computed(() => pullHeight.value >= TRIGGER_HEIGHT);
const indicatorHeight = computed(() =>
  isRefreshing.value
    ? REFRESHING_HEIGHT
    : Math.min(pullHeight.value, TRIGGER_HEIGHT)
);

async function startRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await props.refresh();
  } finally {
    isRefreshing.value = false;
  }
}
</script>
