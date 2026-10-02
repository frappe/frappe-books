<template>
  <FrappeScrollArea
    class="w-full min-h-0 flex-1 rounded-t-4 text-ink-gray-9"
    viewport-class="py-3"
  >
    <!-- Items Grid -->
    <div
      class="grid w-full gap-3"
      style="
        grid-template-columns: repeat(auto-fill, minmax(min(10rem, 100%), 1fr));
      "
    >
      <button
        v-for="item in items"
        :key="item.name"
        type="button"
        class="flex min-h-60 flex-col rounded-6 border border-outline-gray-1 bg-surface-base p-3 text-center transition-colors hover:bg-surface-gray-2 active:bg-surface-gray-3"
        :aria-label="t`Add ${item.name}`"
        @click="$emit('addItem', item)"
      >
        <div class="relative h-28 w-full overflow-hidden rounded-4">
          <img
            v-if="item.image"
            :src="item.image"
            alt=""
            class="h-full w-full object-cover"
          />

          <div
            v-else
            class="rounded-4 w-full h-full bg-surface-gray-3 flex justify-center items-center"
          >
            <p class="text-4xl-semibold text-ink-gray-4 select-none">
              {{ getItemInitials(item.name) }}
            </p>
          </div>
          <FrappeBadge
            class="absolute top-1 right-1"
            :theme="item.availableQty > 0 ? 'green' : 'red'"
            :label="item.availableQty"
          />
        </div>
        <div class="mt-3 flex flex-1 flex-col gap-1">
          <h3
            class="flex min-h-12 items-center justify-center break-words text-p-base-medium text-ink-gray-9"
          >
            {{ item.name }}
          </h3>

          <p class="mt-auto text-base-medium text-ink-gray-9">
            {{ fyo.format(item.rate, 'Currency') }}
          </p>
        </div>
      </button>
    </div>
  </FrappeScrollArea>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import {
  Badge as FrappeBadge,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { getItemInitials } from 'src/utils/pos';
import { POSItem } from './types';

export default defineComponent({
  name: 'ItemsGrid',
  components: { FrappeBadge, FrappeScrollArea },
  emits: ['addItem'],
  props: {
    items: {
      type: Array as PropType<POSItem[]>,
      default: () => [],
    },
  },
  methods: { getItemInitials },
});
</script>
