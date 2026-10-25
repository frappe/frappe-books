<template>
  <section v-if="isShown && isMobile" class="flex flex-col gap-3 p-4">
    <div
      class="min-w-0 overflow-hidden rounded-6 border border-outline-gray-2 bg-surface-base"
    >
      <div
        class="flex h-10 items-center gap-2 border-b border-outline-gray-2 bg-surface-gray-1 px-3"
      >
        <h2 class="min-w-0 flex-1 truncate text-lg-semibold text-ink-gray-8">
          {{ config.label }}
        </h2>
      </div>
      <p v-if="!rows.length" class="px-3 py-4 text-md text-ink-gray-5">
        {{ config.emptyMessage }}
      </p>
      <FrappeList v-else class="list-gap-2.5 list-row-px-3">
        <FrappeListRow
          v-for="row of rows"
          :key="row.name as string"
          class="min-h-16 py-2.5"
          @click="open(row as RenderData)"
        >
          <FrappeListCell>
            <div class="min-w-0">
              <div class="truncate text-lg text-ink-gray-8">
                {{ getValue(row as RenderData, titleColumn) }}
              </div>
              <div class="mt-0.5 truncate text-md tabular-nums text-ink-gray-5">
                {{ getMeta(row as RenderData) }}
              </div>
            </div>
          </FrappeListCell>
          <FrappeListCell class="justify-end gap-2.5">
            <span
              v-if="amountColumn"
              class="text-lg-medium tabular-nums text-ink-gray-8"
              dir="ltr"
            >
              {{ getValue(row as RenderData, amountColumn) }}
            </span>
            <span
              class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4 rtl-rotate-180"
              aria-hidden="true"
            />
          </FrappeListCell>
        </FrappeListRow>
      </FrappeList>
      <button
        v-if="hasMore"
        class="flex h-11 w-full items-center border-t border-outline-gray-1 px-3 text-md-medium text-ink-gray-8 active:bg-surface-gray-2"
        @click="viewAll"
      >
        {{ t`View all` }}
      </button>
      <button
        v-if="canCreate"
        class="flex h-11 w-full items-center gap-2 border-t border-outline-gray-1 px-3 text-md-medium text-ink-gray-8 active:bg-surface-gray-2"
        @click="add"
      >
        <span class="lucide-plus size-5" aria-hidden="true" />
        {{ config.addLabel }}
      </button>
    </div>
  </section>
  <section v-else-if="isShown" class="flex flex-col gap-3 py-5">
    <div class="flex min-h-7 items-center justify-between gap-2">
      <h2 class="text-base font-semibold text-ink-gray-9">
        {{ config.label }}
      </h2>
      <FrappeButton
        v-if="canCreate"
        variant="subtle"
        icon-left="lucide-plus"
        :label="config.addLabel"
        @click="add"
      />
    </div>
    <p v-if="!rows.length" class="text-base text-ink-gray-5">
      {{ config.emptyMessage }}
    </p>
    <FrappeList
      v-else
      :columns="tracks"
      divider="full"
      class="text-ink-gray-8 list-gap-4 list-row-px-3"
    >
      <FrappeListHeader>
        <FrappeListHeaderCell
          v-for="column of columns"
          :key="column.fieldname"
          :class="isNumeric(column.fieldtype) ? 'justify-end' : ''"
        >
          {{ column.label }}
        </FrappeListHeaderCell>
        <FrappeListHeaderCell>
          <span class="sr-only">{{ t`Open` }}</span>
        </FrappeListHeaderCell>
      </FrappeListHeader>
      <FrappeListRow
        v-for="row of rows"
        :key="row.name as string"
        @click="open(row as RenderData)"
      >
        <FrappeListCell
          v-for="column of columns"
          :key="column.fieldname"
          :class="isNumeric(column.fieldtype) ? 'justify-end tabular-nums' : ''"
        >
          <ListCell
            class="min-w-0 flex-1"
            :row="row as RenderData"
            :column="column"
          />
        </FrappeListCell>
        <FrappeListCell class="justify-end">
          <span
            class="lucide-chevron-right size-4 text-ink-gray-4 rtl-rotate-180"
            aria-hidden="true"
          />
        </FrappeListCell>
      </FrappeListRow>
    </FrappeList>
    <div v-if="hasMore">
      <FrappeButton :label="t`View all`" @click="viewAll" />
    </div>
  </section>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import type { LinkedRecords, RenderData } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { FieldTypeEnum } from 'schemas/types';
import type { FrappeDoc } from 'src/frappe/document';
import { getFrappeListPage } from 'src/frappe/list';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { onListChange } from 'src/utils/listData';
import { getFormRoute, openNewDoc, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { defineComponent, type PropType } from 'vue';
import ListCell from '../ListView/ListCell.vue';
import {
  formatColumnValue,
  getColumnTrack,
  getListColumns,
  type ListColumn,
} from '../ListView/listColumns';

// A form lists this many; View all opens the rest in their list.
const LIMIT = 20;

/** A saved document's linked records, e.g. an item's prices, listed read only with Add and View all. */
export default defineComponent({
  name: 'LinkedRecordsSection',
  components: {
    FrappeButton,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    ListCell,
  },
  props: {
    doc: { type: Object as PropType<FrappeDoc>, required: true },
    config: { type: Object as PropType<LinkedRecords>, required: true },
  },
  setup() {
    return { isMobile };
  },
  data() {
    return { rows: [] as RenderData[], total: 0 };
  },
  computed: {
    isShown(): boolean {
      return !this.doc.notInserted && fyo.can(this.config.schemaName, 'read');
    },
    canCreate(): boolean {
      return fyo.can(this.config.schemaName, 'create');
    },
    hasMore(): boolean {
      return this.total > this.rows.length;
    },
    columns(): ListColumn[] {
      return getListColumns(this.config.schemaName, this.config);
    },
    tracks(): string[] {
      return [...this.columns.map(getColumnTrack), '1rem'];
    },
    titleColumn(): ListColumn {
      return this.columns[0];
    },
    amountColumn(): ListColumn | undefined {
      return this.columns.find(
        (column) => column.fieldtype === FieldTypeEnum.Currency
      );
    },
  },
  watch: {
    'doc.name': 'load',
    isShown: 'load',
  },
  async mounted() {
    onListChange(fyo, this.config.schemaName, () => this.load());
    await this.load();
  },
  async activated() {
    await this.load();
  },
  methods: {
    isNumeric,
    async load() {
      if (!this.isShown) {
        return;
      }

      const { rows, total } = await getFrappeListPage(
        fyo,
        this.config.schemaName,
        { filters: this.filters(), orFilters: [], start: 0, limit: LIMIT }
      );
      this.rows = rows;
      this.total = total;
    },
    filters(): Filter[] {
      const { doctype, name } = this.doc;
      if (this.config.dynamicLink) {
        return [
          ['Dynamic Link', 'link_doctype', '=', doctype],
          ['Dynamic Link', 'link_name', '=', name],
        ];
      }

      return [[this.config.linkField, '=', name]];
    },
    getValue(row: RenderData, column: ListColumn): string {
      return formatColumnValue(row, column);
    },
    /** A phone row's second line: the other columns, a date range as one. */
    getMeta(row: RenderData): string {
      const range: string[] = this.config.dateRange ?? [];
      const parts = this.columns
        .filter(
          (column) =>
            column !== this.titleColumn &&
            column !== this.amountColumn &&
            !range.includes(column.fieldname)
        )
        .map((column) => this.getValue(row, column));
      return [...parts, this.getRange(row)].filter(Boolean).join(' · ');
    },
    getRange(row: RenderData): string {
      if (!this.config.dateRange) {
        return '';
      }

      const [from, upto] = this.config.dateRange.map(
        (fieldname) => row[fieldname] && fyo.format(row[fieldname], 'Date')
      );
      if (from && upto) {
        return `${from} – ${upto}`;
      }

      return from ? this.t`from ${from}` : upto ? this.t`until ${upto}` : '';
    },
    async open(row: RenderData) {
      await routeTo(getFormRoute(this.config.schemaName, row.name as string));
    },
    async add() {
      const { doctype, name } = this.doc;
      const link = this.config.dynamicLink
        ? [{ link_doctype: doctype, link_name: name }]
        : name;
      await openNewDoc(this.config.schemaName, {
        [this.config.linkField]: link,
      });
    },
    async viewAll() {
      await routeTo({
        path: `/list/${this.config.schemaName}`,
        query: { filters: JSON.stringify(this.filters()) },
      });
    },
  },
});
</script>
