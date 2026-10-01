<template>
  <MobileList
    v-if="isMobile"
    :schema-name="schemaName"
    :rows="data as RenderData[]"
    :columns="columns"
    :total="total"
    :is-loading="isLoading"
    :is-loading-more="isLoadingMore"
    :is-filtered="isFiltered"
    :can-create="canCreate"
    :is-selection-mode="isSelectionMode"
    :selected-items="selectedItems"
    :refresh="updateData"
    @open-doc="(name: string) => $emit('openDoc', name)"
    @load-more="loadMore"
    @make-new-doc="$emit('makeNewDoc')"
    @clear-filters="$emit('clearFilters')"
    @update-selection="updateSelection"
  />
  <div v-else class="flex flex-col overflow-hidden text-base">
    <FrappeScrollArea
      v-if="data.length"
      class="min-h-0 flex-1"
      viewport-class="px-3 pb-10 sm:px-5"
    >
      <FrappeList
        :columns="listColumns"
        :selectable="isSelectionMode"
        :selection="selectedItems"
        :row-height="48"
        divider="full"
        class="-mx-3 text-ink-gray-7 list-gap-4 list-row-px-3"
        @update:selection="updateSelection"
      >
        <FrappeListHeader class="sticky top-0 z-10 bg-surface-base">
          <FrappeListHeaderCell class="justify-end pe-2">#</FrappeListHeaderCell>
          <template v-for="column in columns" :key="column.label">
            <FrappeListHeaderCellSort
              v-if="isSortableField(schemaName, column.fieldname)"
              :direction="getSortDirection(column.fieldname)"
              :align="isNumeric(column.fieldtype) ? 'end' : 'start'"
              @click="sortBy(column.fieldname)"
            >
              {{ column.label }}
            </FrappeListHeaderCellSort>
            <FrappeListHeaderCell
              v-else
              :class="isNumeric(column.fieldtype) ? 'justify-end' : ''"
            >
              {{ column.label }}
            </FrappeListHeaderCell>
          </template>
        </FrappeListHeader>

        <FrappeListRows :items="data" row-key="name">
          <template #default="{ item: row, index, value }">
            <FrappeListRow
              :value="value"
              @click="isSelectionMode ? undefined : $emit('openDoc', row.name)"
            >
              <FrappeListCell class="justify-end pe-2 text-ink-gray-5">
                {{ index + pageStart + 1 }}
              </FrappeListCell>
              <FrappeListCell
                v-for="(column, columnIndex) in columns"
                :key="column.label"
                :class="[
                  isNumeric(column.fieldtype) ? 'justify-end text-end' : '',
                  columnIndex === 0 ? 'text-ink-gray-8' : '',
                ]"
              >
                <ListCell
                  class="min-w-0 flex-1"
                  :row="row as RenderData"
                  :column="column"
                />
              </FrappeListCell>
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </FrappeList>
    </FrappeScrollArea>

    <!-- First Load -->
    <div v-else-if="isLoading" class="px-3 pt-8 sm:px-5" aria-hidden="true">
      <div
        v-for="row in 8"
        :key="row"
        class="flex h-12 items-center border-b border-outline-gray-1"
      >
        <FrappeSkeleton class="h-4 w-full" />
      </div>
    </div>

    <!-- Pagination Footer -->
    <div v-if="total" class="mt-auto">
      <hr class="border-outline-gray-1" />
      <Paginator
        ref="paginator"
        :item-count="total"
        :allowed-counts="[50, 100, 500]"
        class="px-3 sm:px-5"
        @index-change="setPageIndices"
      />
    </div>

    <!-- Empty State -->
    <div
      v-if="!isLoading && !total"
      class="my-auto flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5">
        <span class="lucide-inbox size-6" aria-hidden="true" />
      </div>
      <p class="text-base text-ink-gray-7">{{ t`No entries found` }}</p>
      <template v-if="canCreate">
        <p class="text-sm text-ink-gray-5">
          {{ t`Create one to get started.` }}
        </p>
        <FrappeButton
          class="mt-2"
          variant="solid"
          icon-left="lucide-plus"
          :label="t`Make Entry`"
          @click="$emit('makeNewDoc')"
        />
      </template>
    </div>
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
  Skeleton as FrappeSkeleton,
} from 'frappe-ui';
import { ListViewSettings, RenderData } from 'fyo/model/types';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListHeaderCellSort as FrappeListHeaderCellSort,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import Paginator from 'src/components/Paginator.vue';
import { isSortableField, type ListSort } from 'src/frappe/list';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { loadListData, onListChange } from 'src/utils/listData';
import type { Filter } from 'src/frappe/api';
import { isMobile } from 'src/utils/viewport';
import { PropType, defineComponent } from 'vue';
import ListCell from './ListCell.vue';
import {
  getColumnTrack,
  getListColumns,
  type ListColumn,
} from './listColumns';
import MobileList from './MobileList.vue';

const mobilePageLength = 20;

export default defineComponent({
  name: 'List',
  components: {
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListHeaderCellSort,
    FrappeListRow,
    FrappeListRows,
    FrappeScrollArea,
    FrappeSkeleton,
    ListCell,
    FrappeButton,
    MobileList,
    Paginator,
  },
  props: {
    listConfig: {
      type: Object as PropType<ListViewSettings | undefined>,
      default: () => ({ columns: [] }),
    },
    filters: {
      type: Array as PropType<Filter[]>,
      default: () => [],
    },
    schemaName: { type: String, required: true },
    canCreate: Boolean,
    isSelectionMode: Boolean,
  },
  emits: [
    'openDoc',
    'makeNewDoc',
    'updatedData',
    'selected-items-changed',
    'clearFilters',
  ],
  setup() {
    return { isMobile };
  },
  data() {
    return {
      data: [] as RenderData[],
      total: 0,
      isLoading: true,
      isLoadingMore: false,
      pageStart: 0,
      pageLength: isMobile.value ? mobilePageLength : 50,
      selectedItems: [] as string[],
      activeFilters: [] as Filter[],
      orFilters: [] as Filter[],
      sort: null as ListSort | null,
      requestId: 0,
    };
  },
  computed: {
    listColumns(): string[] {
      return ['2rem', ...this.columns.map(getColumnTrack)];
    },
    columns(): ListColumn[] {
      return getListColumns(this.schemaName, this.listConfig);
    },
    isFiltered(): boolean {
      return this.activeFilters.length > 0 || this.orFilters.length > 0;
    },
  },
  watch: {
    isSelectionMode(isSelecting: boolean) {
      if (!isSelecting) {
        this.updateSelection([]);
      }
    },
    async schemaName(oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }

      this.sort = null;
      await this.updateData([]);
    },
    filters: {
      deep: true,
      handler() {
        void this.updateData();
      },
    },
  },
  async mounted() {
    await this.updateData();
    this.setUpdateListeners();
  },
  methods: {
    isNumeric,
    isSortableField,
    getSortDirection(fieldname: string): ListSort['direction'] | null {
      return this.sort?.fieldname === fieldname ? this.sort.direction : null;
    },
    /** Ascending first, then flips; a new order starts from the first page. */
    async sortBy(fieldname: string) {
      const isAscending = this.getSortDirection(fieldname) === 'asc';
      this.sort = { fieldname, direction: isAscending ? 'desc' : 'asc' };
      await this.updateData(this.activeFilters, this.orFilters);
    },
    async setPageIndices({ start, end }: { start: number; end: number }) {
      if (start === this.pageStart && end - start === this.pageLength) {
        return;
      }

      this.pageStart = start;
      this.pageLength = end - start;
      await this.updateData();
    },
    setUpdateListeners() {
      if (this.schemaName) {
        onListChange(fyo, this.schemaName, () => this.updateData());
      }
    },
    async updateData(filters?: Filter[], orFilters?: Filter[]) {
      if (filters !== undefined) {
        this.isLoading = true;
        if (isMobile.value) this.pageLength = mobilePageLength;
      }
      const loaded = await loadListData(fyo, this, filters, orFilters).catch(
        (error: unknown) => {
          this.isLoading = false;
          throw error;
        }
      );
      if (!loaded) return;
      this.isLoading = false;
      this.data = loaded.rows;
      this.total = loaded.total;
      const { requestId } = this;
      await this.$nextTick();
      if (requestId !== this.requestId) return;
      const paginator = this.$refs.paginator as
        InstanceType<typeof Paginator> | undefined;
      // Clamps the page when rows were removed; a moved page reloads its rows.
      paginator?.setPageNo(filters !== undefined ? 1 : paginator.pageNo);
      this.$emit('updatedData', loaded.appliedFilters);
    },
    async loadMore() {
      this.isLoadingMore = true;
      this.pageLength += mobilePageLength;
      try {
        await this.updateData();
      } finally {
        this.isLoadingMore = false;
      }
    },
    updateSelection(selectedItems: string[]) {
      this.selectedItems = selectedItems;
      this.$emit('selected-items-changed', this.selectedItems);
    },
  },
});
</script>
