<template>
  <MobilePullToRefresh :refresh="refresh" class="flex flex-col">
    <div v-if="isLoading" aria-busy="true" :aria-label="t`Loading`">
      <div
        v-for="(width, index) in skeletonWidths"
        :key="index"
        class="flex h-[68px] flex-col justify-center gap-2.5 border-b border-outline-gray-1 px-4"
      >
        <span class="flex justify-between">
          <span
            class="h-[13px] rounded-[6px] bg-surface-gray-2"
            :style="{ width: `${width}px` }"
          />
          <span class="h-[13px] w-[84px] rounded-[6px] bg-surface-gray-2" />
        </span>
        <span class="flex justify-between">
          <span class="h-[11px] w-[120px] rounded-[6px] bg-surface-gray-1" />
          <span class="h-[11px] w-12 rounded-full bg-surface-gray-1" />
        </span>
      </div>
    </div>

    <template v-else-if="rows.length">
      <MobileListRow
        v-for="row in rows"
        :key="String(row.name)"
        :row="row"
        :layout="layout"
        @open="$emit('openDoc', row.name)"
      />
      <div class="flex flex-col items-center gap-2.5 px-4 pb-6 pt-4">
        <p class="text-sm tabular-nums text-ink-gray-5">
          {{ t`${rows.length} of ${total}` }}
        </p>
        <FrappeButton
          v-if="rows.length < total"
          size="lg"
          :loading="isLoadingMore"
          :label="t`Load more`"
          @click="$emit('loadMore')"
        />
      </div>
    </template>

    <div
      v-else
      class="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-8"
    >
      <img src="../../assets/img/list-empty-state.svg" alt="" class="w-24" />
      <p class="text-base text-ink-gray-8">{{ t`No entries found` }}</p>
      <FrappeButton
        v-if="isFiltered"
        variant="solid"
        size="lg"
        :label="t`Clear filters`"
        @click="$emit('clearFilters')"
      />
      <FrappeButton
        v-else-if="canCreate"
        variant="solid"
        size="lg"
        :label="t`Make Entry`"
        @click="$emit('makeNewDoc')"
      />
    </div>
  </MobilePullToRefresh>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import type { RenderData } from 'fyo/model/types';
import MobilePullToRefresh from 'src/mobile/MobilePullToRefresh.vue';
import { defineComponent, type PropType } from 'vue';
import type { ListColumn } from './listColumns';
import MobileListRow from './MobileListRow.vue';
import { getMobileRowLayout, type MobileRowLayout } from './mobileRowLayout';

export default defineComponent({
  name: 'MobileList',
  components: { FrappeButton, MobileListRow, MobilePullToRefresh },
  props: {
    schemaName: { type: String, required: true },
    rows: { type: Array as PropType<RenderData[]>, required: true },
    columns: { type: Array as PropType<ListColumn[]>, required: true },
    total: { type: Number, required: true },
    isLoading: Boolean,
    isLoadingMore: Boolean,
    isFiltered: Boolean,
    canCreate: Boolean,
    refresh: {
      type: Function as PropType<() => Promise<unknown>>,
      required: true,
    },
  },
  emits: ['openDoc', 'loadMore', 'makeNewDoc', 'clearFilters'],
  data() {
    return { skeletonWidths: [140, 110, 160, 120, 150, 100, 130, 145] };
  },
  computed: {
    layout(): MobileRowLayout {
      return getMobileRowLayout(this.schemaName, this.columns);
    },
  },
});
</script>
