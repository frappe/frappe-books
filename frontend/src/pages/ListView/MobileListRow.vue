<template>
  <button
    type="button"
    class="flex min-h-[68px] w-full items-center gap-3 border-b border-outline-gray-1 px-4 py-2.5 text-start active:bg-surface-gray-1"
    @click="$emit('open')"
  >
    <FrappeAvatar
      v-if="layout.avatar"
      size="lg"
      class="size-9"
      :shape="layout.avatar"
      :label="title"
      :image="image"
    />
    <span class="flex min-w-0 flex-1 flex-col gap-1.5">
      <span class="flex items-baseline gap-3">
        <span class="min-w-0 flex-1 truncate text-md-medium text-ink-gray-9">
          {{ title }}
        </span>
        <span
          v-if="amount"
          dir="ltr"
          class="shrink-0 text-md-medium tabular-nums text-ink-gray-9"
        >
          {{ amount }}
        </span>
      </span>
      <span v-if="meta || badge" class="flex items-center gap-3">
        <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-5">
          {{ meta }}
        </span>
        <FrappeBadge v-if="badge" :theme="badge.theme">
          {{ badge.label }}
        </FrappeBadge>
      </span>
    </span>
  </button>
</template>
<script lang="ts">
import { Avatar as FrappeAvatar, Badge as FrappeBadge } from 'frappe-ui';
import type { BadgeData, RenderData } from 'fyo/model/types';
import { defineComponent, type PropType } from 'vue';
import { formatColumnValue } from './listColumns';
import {
  getRowAmount,
  getRowMeta,
  type MobileRowLayout,
} from './mobileRowLayout';

export default defineComponent({
  name: 'MobileListRow',
  components: { FrappeAvatar, FrappeBadge },
  props: {
    row: { type: Object as PropType<RenderData>, required: true },
    layout: { type: Object as PropType<MobileRowLayout>, required: true },
  },
  emits: ['open'],
  computed: {
    title(): string {
      return (
        formatColumnValue(this.row, this.layout.title) || String(this.row.name)
      );
    },
    amount(): string {
      return getRowAmount(this.row, this.layout.amount);
    },
    meta(): string {
      return getRowMeta(this.row, this.layout.meta);
    },
    badge(): BadgeData | undefined {
      return this.layout.badge?.badge?.(this.row);
    },
    image(): string | undefined {
      return typeof this.row.image === 'string' ? this.row.image : undefined;
    },
  },
});
</script>
