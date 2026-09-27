<template>
  <div
    v-if="open && !closed"
    class="absolute bottom-0 flex justify-end pb-6 pe-6"
    :style="{ width: fullWidth ? '100%' : 'calc(100% - 12rem)' }"
  >
    <div
      class="
        z-10
        w-96
        rounded-6
        border border-outline-gray-1
        bg-surface-elevation-1
        px-3
        py-3
        text-ink-gray-8
        shadow-lg
      "
    >
      <p v-if="message?.length" class="pb-2 text-base text-ink-gray-6">
        {{ message }}
      </p>

      <div class="flex w-full flex-row items-center gap-2">
        <FrappeProgress
          v-if="percent >= 0"
          class="flex-1"
          size="xl"
          :value="percent * 100"
        />
        <div v-else class="flex h-3 flex-1 items-center">
          <FrappeSpinner size="sm" class="text-ink-gray-6" />
        </div>

        <FrappeButton
          v-if="showX"
          variant="ghost"
          size="xs"
          icon="lucide-x"
          aria-label="Close"
          @click="closeToast"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  Button as FrappeButton,
  Progress as FrappeProgress,
  Spinner as FrappeSpinner,
} from 'frappe-ui';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'BooksLoading',
  components: { FrappeButton, FrappeProgress, FrappeSpinner },
  props: {
    open: { type: Boolean, default: false },
    percent: { type: Number, default: 0.5 },
    message: { type: String, default: '' },
    fullWidth: { type: Boolean, default: false },
    showX: { type: Boolean, default: true },
  },
  data() {
    return {
      closed: false,
    };
  },
  watch: {
    open(value: boolean) {
      if (value) {
        this.closed = false;
      }
    },
  },
  methods: {
    closeToast() {
      this.closed = true;
    },
  },
});
</script>
