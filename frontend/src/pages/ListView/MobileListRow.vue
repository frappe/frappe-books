<template>
  <FrappeListRow :value="String(row.name)" class="h-17" @click="$emit('open')">
    <FrappeListCell class="gap-3">
      <FrappeAvatar
        v-if="layout.avatar"
        size="lg"
        class="size-9"
        :shape="layout.avatar"
        :label="title"
        :image="image"
      />
      <div class="min-w-0">
        <div class="truncate text-lg text-ink-gray-8">{{ title }}</div>
        <div v-if="meta" class="mt-0.5 truncate text-md text-ink-gray-5">
          {{ meta }}
        </div>
      </div>
    </FrappeListCell>
    <FrappeListCell class="justify-end">
      <div class="flex flex-col items-end gap-1">
        <span
          v-if="amount"
          dir="ltr"
          class="text-lg-medium tabular-nums text-ink-gray-8"
        >
          {{ amount }}
        </span>
        <FrappeBadge v-if="badge" :theme="badge.theme">
          {{ badge.label }}
        </FrappeBadge>
      </div>
    </FrappeListCell>
  </FrappeListRow>
</template>
<script lang="ts">
import { Avatar as FrappeAvatar, Badge as FrappeBadge } from 'frappe-ui';
import {
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
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
  components: { FrappeAvatar, FrappeBadge, FrappeListCell, FrappeListRow },
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
