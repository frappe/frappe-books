<template>
  <div class="flex flex-col overflow-hidden text-base">
    <FrappeList
      v-if="dataSlice.length"
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

      <FrappeListRows :items="dataSlice" row-key="name">
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
    <div v-if="data?.length" class="mt-auto">
      <hr class="border-outline-gray-1" />
      <Paginator
        ref="paginator"
        :item-count="data.length"
        class="px-4"
        @index-change="setPageIndices"
      />
    </div>

    <!-- Empty State -->
    <div
      v-if="!data?.length"
      class="flex flex-col items-center justify-center my-auto"
    >
      <img src="../../assets/img/list-empty-state.svg" alt="" class="w-24" />
      <p class="my-3 text-ink-gray-8">
        {{ t`No entries found` }}
      </p>
      <Button v-if="canCreate" type="primary" @click="$emit('makeNewDoc')">
        {{ t`Make Entry` }}
      </Button>
    </div>
  </div>
</template>
<script lang="ts">
import { ListViewSettings, RenderData } from 'fyo/model/types';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import Button from 'src/components/Button.vue';
import Paginator from 'src/components/Paginator.vue';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { loadListData, onListChange } from 'src/utils/listData';
import { QueryFilter } from 'utils/db/types';
import { PropType, defineComponent } from 'vue';
import ListCell from './ListCell.vue';

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
    Button,
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
  emits: ['openDoc', 'makeNewDoc', 'updatedData', 'selected-items-changed'],
  data() {
    return {
      data: [] as RenderData[],
      pageStart: 0,
      pageEnd: 0,
      selectedItems: [] as string[],
      activeFilters: {} as QueryFilter,
      requestId: 0,
    };
  },
  computed: {
    dataSlice() {
      return this.data.slice(this.pageStart, this.pageEnd);
    },
    count() {
      return this.pageEnd - this.pageStart + 1;
    },
    listColumns(): string[] {
      return ['2rem', ...this.columns.map(() => 'minmax(0, 1fr)')];
    },
    columns() {
      let columns = this.listConfig?.columns ?? [];

      if (columns.length === 0) {
        columns = fyo.schemaMap[this.schemaName]?.quickEditFields ?? [];
        columns = [...new Set(['name', ...columns])];
      }

      return columns
        .map((fieldname) => {
          if (typeof fieldname === 'object') {
            return fieldname;
          }

          return fyo.getField(this.schemaName, fieldname);
        })
        .filter(Boolean);
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
    setPageIndices({ start, end }: { start: number; end: number }) {
      this.pageStart = start;
      this.pageEnd = end;
    },
    setUpdateListeners() {
      if (this.schemaName) {
        onListChange(fyo, this.schemaName, () => this.updateData());
      }
    },
    async updateData(filters?: QueryFilter) {
      const loaded = await loadListData(fyo, this, filters);
      if (!loaded) return;
      this.data = loaded.rows;
      const { requestId } = this;
      await this.$nextTick();
      if (requestId !== this.requestId) return;
      const paginator = this.$refs.paginator as
        InstanceType<typeof Paginator> | undefined;
      paginator?.setPageNo(filters !== undefined ? 1 : paginator.pageNo);
      this.$emit('updatedData', loaded.appliedFilters);
    },
    updateSelection(selectedItems: string[]) {
      this.selectedItems = selectedItems;
      this.$emit('selected-items-changed', this.selectedItems);
    },
  },
});
</script>
