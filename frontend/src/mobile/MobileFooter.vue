<template>
  <Teleport v-if="isShown && target" :to="target">
    <footer
      v-bind="$attrs"
      class="flex gap-2 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
      <slot />
    </footer>
  </Teleport>
</template>
<script setup lang="ts">
import { mobileFooterKey } from 'src/utils/injectionKeys';
import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
} from 'vue';

defineOptions({ inheritAttrs: false });

/** A phone page's pinned actions, shown in place of the bottom tabs. */
const { target, owners } = inject(mobileFooterKey)!;
const owner = Symbol('footer');
const isShown = computed(() => owners.has(owner));

// Teleported content stays behind when keep-alive caches its page.
const show = () => owners.add(owner);
const hide = () => owners.delete(owner);
onMounted(show);
onActivated(show);
onDeactivated(hide);
onBeforeUnmount(hide);
</script>
