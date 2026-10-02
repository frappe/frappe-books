<template>
  <div
    class="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden bg-surface-gray-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 p-4"
  >
    <div class="col-span-1 flex min-w-0 min-h-[36rem] w-full lg:min-h-0">
      <div class="flex min-h-0 w-full flex-col gap-3">
        <div
          class="p-4 min-h-0 flex flex-col flex-1 bg-surface-base border rounded-6 border-outline-gray-1"
        >
          <slot name="cart" />
        </div>

        <div
          class="flex flex-col gap-4 shrink-0 bg-surface-base border rounded-6 border-outline-gray-1 p-4"
        >
          <slot name="summary" />
        </div>
      </div>
    </div>

    <div
      class="bg-surface-base border rounded-6 col-span-1 relative min-w-0 min-h-[28rem] lg:min-h-0 flex flex-col border-outline-gray-1"
    >
      <div class="flex h-full min-h-0 flex-col rounded-4 p-4 col-span-5">
        <slot name="items" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

/** Cart and totals on the left, items on the right. */
export default defineComponent({ name: 'ModernPOS' });
</script>
