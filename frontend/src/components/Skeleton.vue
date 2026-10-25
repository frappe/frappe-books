<template>
  <FrappeSkeleton :class="{ invisible: !shown }" />
</template>
<script setup lang="ts">
import { Skeleton as FrappeSkeleton } from 'frappe-ui';
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** A frappe-ui skeleton bar that shows only once loading outlasts a blink, so fast loads don't flash it. */
const SHOW_AFTER_MS = 300;

const shown = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  timer = setTimeout(() => (shown.value = true), SHOW_AFTER_MS);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>
