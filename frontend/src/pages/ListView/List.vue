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
    :refresh="updateData"
    @open-doc="(name: string) => $emit('openDoc', name)"
    @load-more="loadMore"
    @make-new-doc="$emit('makeNewDoc')"
    @clear-filters="$emit('clearFilters')"
  />
  <div v-else class="flex flex-col overflow-hidden text-base">
    <FrappeList
      v-if="data.length"
      :columns="listColumns"
      :selectable="isSelectionMode"
      :selection="selectedItems"
      :row-height="48"
      divider="full"
      class="custom-scroll custom-scroll-thumb1 min-h-0 flex-1 overflow-y-auto text-ink-gray-8 list-gap-4 list-row-px-3"
      @update:selection="updateSelection"
    >
      <FrappeListHeader class="sticky top-0 z-10 bg-surface-base">
        <FrappeListHeaderCell class="justify-end pe-2">#</FrappeListHeaderCell>
        <FrappeListHeaderCell
          v-for="column in columns"
          :key="column.label"
          :class="isNumeric(column.fieldtype) ? 'justify-end' : ''"
        >
          {{ column.label }}
        </FrappeListHeaderCell>
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
              v-for="column in columns"
              :key="column.label"
              :class="isNumeric(column.fieldtype) ? 'justify-end text-end' : ''"
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

    <!-- Pagination Footer -->
    <div v-if="total" class="mt-auto">
      <hr class="border-outline-gray-1" />
      <Paginator
        ref="paginator"
        :item-count="total"
        :allowed-counts="[50, 100, 500]"
        class="px-4"
        @index-change="setPageIndices"
      />
    </div>

    <!-- Empty State -->
    <div
      v-if="!total"
      class="flex flex-col items-center justify-center my-auto"
    >
      <img src="../../assets/img/list-empty-state.svg" alt="" class="w-24" />
      <p class="my-3 text-ink-gray-8">
        {{ t`No entries found` }}
      </p>
      <FrappeButton v-if="canCreate" variant="solid" @click="$emit('makeNewDoc')">
        {{ t`Make Entry` }}
      </FrappeButton>
    </div>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { ListViewSettings, RenderData } from 'fyo/model/types';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import Paginator from 'src/components/Paginator.vue';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { loadListData, onListChange } from 'src/utils/listData';
import { isMobile } from 'src/utils/viewport';
import { QueryFilter } from 'utils/db/types';
import { PropType, defineComponent } from 'vue';
import ListCell from './ListCell.vue';
import { getListColumns, type ListColumn } from './listColumns';
import MobileList from './MobileList.vue';

const mobilePageLength = 20;

export default defineComponent({
  name: 'List',
  components: {
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
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
      type: Object as PropType<QueryFilter>,
      default: () => ({}),
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
      activeFilters: {} as QueryFilter,
      requestId: 0,
    };
  },
  computed: {
    listColumns(): string[] {
      return ['2rem', ...this.columns.map(() => 'minmax(0, 1fr)')];
    },
    columns(): ListColumn[] {
      return getListColumns(this.schemaName, this.listConfig);
    },
    isFiltered(): boolean {
      return Object.keys(this.activeFilters).length > 0;
    },
  },
  watch: {
    async schemaName(oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }

      await this.updateData({});
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
    async updateData(filters?: QueryFilter) {
      if (filters !== undefined) {
        this.isLoading = true;
        if (isMobile.value) this.pageLength = mobilePageLength;
      }
      const loaded = await loadListData(fyo, this, filters).catch(
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
