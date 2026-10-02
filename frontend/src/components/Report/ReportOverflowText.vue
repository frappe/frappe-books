<template>
  <span ref="container" class="block min-w-0 w-full" data-report-text>
    <FrappeTooltip :disabled="!isTruncated" :hover-delay="300">
      <span
        ref="text"
        class="block truncate rounded-1"
        :tabindex="isTruncated ? 0 : undefined"
        >{{ value }}</span
      >
      <template #content>
        <span
          class="block max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words text-p-sm select-text"
          >{{ value }}</span
        >
      </template>
    </FrappeTooltip>
  </span>
</template>

<script setup lang="ts">
import { Tooltip as FrappeTooltip } from 'frappe-ui';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ value: string }>();
const container = ref<HTMLElement>();
const text = ref<HTMLElement>();
const isTruncated = ref(false);
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(checkOverflow);
  observer.observe(container.value!);
  checkOverflow();
  void document.fonts.ready.then(checkOverflow);
});

onBeforeUnmount(() => observer?.disconnect());
watch(() => props.value, checkOverflow, { flush: 'post' });

function checkOverflow() {
  isTruncated.value =
    !!text.value && text.value.scrollWidth > text.value.clientWidth;
}
</script>
