<template>
  <div
    class="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden bg-surface-gray-1 grid grid-cols-1 xl:grid-cols-12 gap-2 p-4"
  >
    <div
      class="relative col-span-1 xl:col-span-5 min-w-0 min-h-[28rem] xl:min-h-0 overflow-hidden bg-surface-base border rounded-6 border-outline-gray-1"
    >
      <div class="flex h-full min-h-0 flex-col rounded-4 p-4 col-span-5">
        <slot name="items" />
      </div>
    </div>

    <div class="col-span-1 min-w-0 min-h-[36rem] xl:col-span-7 xl:min-h-0">
      <div class="flex h-full min-h-0 flex-col gap-3">
        <div
          class="p-4 bg-surface-base border rounded-6 min-h-0 flex-1 flex flex-col border-outline-gray-1"
        >
          <slot name="cart" />
        </div>

        <div
          class="grid shrink-0 grid-cols-1 gap-5 rounded-6 border border-outline-gray-1 bg-surface-base p-4 sm:grid-cols-2"
        >
          <slot name="summary" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

/** Items on the left, cart and totals on the right. */
export default defineComponent({ name: 'ClassicPOS' });
</script>
