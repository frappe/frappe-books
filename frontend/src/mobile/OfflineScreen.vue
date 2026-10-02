<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-surface-base px-10 pb-24 text-center"
  >
    <!-- z-[60]: above frappe-ui's sheets and dialogs (z-50), which open later in the DOM. -->
    <span class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5">
      <span class="lucide-wifi-off size-6" aria-hidden="true" />
    </span>
    <h2 class="mt-1 text-3xl-semibold text-ink-gray-8">
      {{ t`No connection` }}
    </h2>
    <p class="text-p-base text-ink-gray-6">
      {{
        t`Books needs an internet connection. Check your network, then try again.`
      }}
    </p>
    <FrappeButton
      class="mt-3 w-full max-w-60"
      size="lg"
      variant="solid"
      :label="t`Try again`"
      :loading="isRetrying"
      :loading-text="t`Trying again`"
      @click="retry"
    />
  </div>
</template>
<script setup lang="ts">
import { useOnline } from '@vueuse/core';
import { Button as FrappeButton } from 'frappe-ui';
import { checkConnection, hasLostConnection } from 'src/web/api';
import { computed, ref, watch } from 'vue';

const isOnline = useOnline();
const isRetrying = ref(false);
const isVisible = computed(() => !isOnline.value || hasLostConnection.value);

watch(isOnline, async (online) => {
  if (online && hasLostConnection.value) {
    await retry();
  }
});

async function retry() {
  isRetrying.value = true;
  try {
    await checkConnection();
  } finally {
    isRetrying.value = false;
  }
}
</script>
