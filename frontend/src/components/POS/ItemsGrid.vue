<template>
  <FrappeScrollArea class="min-h-0 w-full flex-1" viewport-class="px-5 pb-5 pt-1">
    <div
      class="grid w-full gap-2.5"
      style="grid-template-columns: repeat(auto-fill, minmax(min(9.25rem, 100%), 1fr))"
    >
      <button
        v-for="item in items"
        :key="item.name"
        type="button"
        class="flex flex-col gap-2 rounded-6 border border-outline-gray-1 bg-surface-base p-1.5 pb-2.5 text-start transition-colors hover:border-outline-gray-2 hover:bg-surface-gray-1 active:bg-surface-gray-2"
        :aria-label="t`Add ${item.name}`"
        @click="$emit('addItem', item)"
      >
        <div
          class="relative flex h-21 w-full items-center justify-center overflow-hidden rounded-4 bg-surface-gray-2"
        >
          <img
            v-if="item.image"
            :src="item.image"
            alt=""
            class="h-full w-full object-cover"
          />
          <span v-else class="select-none text-4xl-semibold text-ink-gray-4">
            {{ getItemInitials(item.name) }}
          </span>
          <FrappeBadge
            class="absolute end-1.5 top-1.5"
            :theme="item.availableQty > 0 ? 'green' : 'red'"
            :label="t`${item.availableQty} in stock`"
          />
        </div>
        <div class="flex flex-col gap-1 px-1">
          <span class="text-p-base-medium text-ink-gray-8">{{ item.name }}</span>
          <span class="text-sm tabular-nums text-ink-gray-6">
            {{ fyo.format(item.rate, 'Currency') }}
          </span>
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
