<template>
  <MobilePullToRefresh :refresh="refresh" class="flex flex-col">
    <FrappeList
      v-if="isLoading"
      class="list-row-px-4"
      :columns="['minmax(0,1fr)', 'auto']"
      aria-busy="true"
      :aria-label="t`Loading`"
    >
      <FrappeListRow
        v-for="(width, index) in skeletonWidths"
        :key="index"
        class="h-17"
      >
        <FrappeListCell>
          <div class="flex flex-col gap-2">
            <FrappeSkeleton
              class="h-4 rounded-4"
              :style="{ width: `${width}px` }"
            />
            <FrappeSkeleton class="h-3.5 w-28 rounded-4" />
          </div>
        </FrappeListCell>
        <FrappeListCell class="justify-end">
          <div class="flex flex-col items-end gap-2">
            <FrappeSkeleton class="h-4 w-20 rounded-4" />
            <FrappeSkeleton class="h-3.5 w-12 rounded-full" />
          </div>
        </FrappeListCell>
      </FrappeListRow>
    </FrappeList>

    <template v-else-if="rows.length">
      <FrappeList
        class="list-row-px-4"
        :columns="['minmax(0,1fr)', 'auto']"
        :selectable="isSelectionMode"
        :selection="selectedItems"
        @update:selection="(items: string[]) => $emit('updateSelection', items)"
      >
        <MobileListRow
          v-for="row in rows"
          :key="String(row.name)"
          :row="row"
          :layout="layout"
          @open="$emit('openDoc', String(row.name))"
        />
      </FrappeList>
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

    <MobileEmptyState
      v-else
      class="flex-1 py-16"
      :icon="isFiltered ? 'lucide-search-x' : 'lucide-inbox'"
      :title="t`No entries found`"
      :description="isFiltered ? t`No results match the current filters` : ''"
    >
      <FrappeButton
        v-if="isFiltered"
        class="mt-2"
        variant="solid"
        size="lg"
        :label="t`Clear filters`"
        @click="$emit('clearFilters')"
      />
      <FrappeButton
        v-else-if="canCreate"
        class="mt-2"
        variant="solid"
        size="lg"
        icon-left="lucide-plus"
        :label="t`Make Entry`"
        @click="$emit('makeNewDoc')"
      />
    </MobileEmptyState>
  </MobilePullToRefresh>
</template>
<script lang="ts">
import { Button as FrappeButton, Skeleton as FrappeSkeleton } from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import type { RenderData } from 'fyo/model/types';
import MobileEmptyState from 'src/mobile/MobileEmptyState.vue';
import MobilePullToRefresh from 'src/mobile/MobilePullToRefresh.vue';
import { defineComponent, type PropType } from 'vue';
import type { ListColumn } from './listColumns';
import MobileListRow from './MobileListRow.vue';
import { getMobileRowLayout, type MobileRowLayout } from './mobileRowLayout';

export default defineComponent({
  name: 'MobileList',
  components: {
    FrappeButton,
    FrappeList,
    FrappeListCell,
    FrappeListRow,
    FrappeSkeleton,
    MobileEmptyState,
    MobileListRow,
    MobilePullToRefresh,
  },
  props: {
    schemaName: { type: String, required: true },
    rows: { type: Array as PropType<RenderData[]>, required: true },
    columns: { type: Array as PropType<ListColumn[]>, required: true },
    total: { type: Number, required: true },
    isLoading: Boolean,
    isLoadingMore: Boolean,
    isFiltered: Boolean,
    canCreate: Boolean,
    isSelectionMode: Boolean,
    selectedItems: { type: Array as PropType<string[]>, default: () => [] },
    refresh: {
      type: Function as PropType<() => Promise<unknown>>,
      required: true,
    },
  },
  emits: [
    'openDoc',
    'loadMore',
    'makeNewDoc',
    'clearFilters',
    'updateSelection',
  ],
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
