<template>
  <div class="overflow-hidden flex flex-col h-full">
    <FrappeScrollArea
      v-if="dataSlice.length"
      orientation="both"
      class="min-h-0 flex-1 [container-type:inline-size]"
      viewport-class="px-3 pb-10 sm:px-5"
    >
      <!-- As wide as the report body, not the table, and kept in view when the table scrolls sideways. -->
      <ReportExtras
        :report="report"
        class="sticky start-0 mb-4 w-[calc(100cqw-1.5rem)] sm:w-[calc(100cqw-2.5rem)]"
      />
      <FrappeList
        ref="list"
        :columns="listColumns"
        :row-height="40"
        divider="full"
        class="-mx-3 text-base tabular-nums list-gap-4 list-row-px-3"
      >
        <FrappeListHeader class="sticky top-0 z-10 min-w-max bg-surface-base">
          <ReportColumnHeader
            v-for="(column, index) in report.columns"
            :key="column.fieldname"
            :ref="(header) => (columnHeaders[column.fieldname] = header)"
            :label="column.label"
            :width="columnWidths.get(column)"
            :direction="languageDirection"
            :class="getAlignmentClass(column)"
            @resize="columnWidths.set(column.fieldname, $event)"
            @commit="columnWidths.set(column.fieldname, $event, true)"
            @fit="fitColumn(column, index)"
          />
        </FrappeListHeader>

        <FrappeListRows :items="dataSlice" :row-key="getRowKey">
          <template #default="{ item: row, index, value }">
            <FrappeListRow
              v-if="!row.folded"
              :class="{ 'bg-surface-gray-1': row.isShaded }"
              :value="value"
              :on-click="row.isGroup ? () => onRowClick(row, index) : undefined"
            >
              <FrappeListCell
                v-for="(cell, cellIndex) in row.cells"
                :key="`${cellIndex}-${index}-cell`"
                class="min-w-0"
                :class="[
                  getCellColorClass(cell, row),
                  getCellTypeClass(cell, row),
                  getAlignmentClass(cell),
                ]"
                :style="getIndentStyle(cell)"
              >
                <!-- Group rows of ERPNext's account trees fold from a chevron; leaves line up with their names. -->
                <template v-if="hasChevrons && cellIndex === 0">
                  <FrappeIcon
                    v-if="row.isGroup"
                    :icon="
                      row.foldedBelow
                        ? 'lucide-chevron-right'
                        : 'lucide-chevron-down'
                    "
                    class="me-1 size-4 shrink-0 text-ink-gray-5"
                    :class="{ 'rtl-rotate-180': row.foldedBelow }"
                  />
                  <span v-else class="w-5 shrink-0" />
                </template>
                <ReportOverflowText :value="cell.value" />
              </FrappeListCell>
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </FrappeList>
    </FrappeScrollArea>
    <EmptyState
      v-else-if="report.missingFilter"
      class="flex-1 pb-20"
      icon="lucide-filter"
      :title="t`Set ${report.missingFilter.label} to run this report`"
      :description="t`Filters marked * are required by ERPNext`"
    />
    <EmptyState
      v-else-if="report.error"
      class="flex-1 pb-20"
      icon="lucide-triangle-alert"
      :title="t`Report could not be run`"
      :description="report.error"
    />
    <FrappeLoadingText
      v-else-if="report.loading"
      class="mt-20 w-full justify-center"
      :text="t`Loading Report...`"
    />
    <p v-else class="px-3 py-10 text-center text-p-sm text-ink-gray-4">
      {{ t`No values to be displayed` }}
    </p>

    <!-- Pagination Footer -->
    <div v-if="report.usePagination" class="mt-auto flex-shrink-0">
      <Paginator
        ref="paginator"
        :item-count="entryRowIndexes.length"
        class="px-3 sm:px-5"
        @index-change="setPageIndices"
      />
    </div>
  </div>
</template>
<script>
import {
  Icon as FrappeIcon,
  LoadingText as FrappeLoadingText,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import EmptyState from 'src/components/EmptyState.vue';
import { Report } from 'reports/Report';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { isEqual } from 'lodash';
import { isNumeric } from 'src/utils';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { defineComponent, inject } from 'vue';
import Paginator from '../Paginator.vue';
import ReportColumnHeader from './ReportColumnHeader.vue';
import { getReportCellColorClass } from './cellColor';
import { ReportColumnWidths } from './ReportColumnWidths';
import ReportExtras from './ReportExtras.vue';
import ReportOverflowText from './ReportOverflowText.vue';

export default defineComponent({
  components: {
    EmptyState,
    FrappeIcon,
    FrappeLoadingText,
    ReportExtras,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    ReportColumnHeader,
    ReportOverflowText,
    FrappeListRow,
    FrappeListRows,
    FrappeScrollArea,
    Paginator,
  },
  props: {
    report: Report,
  },
  setup() {
    return {
      languageDirection: inject(languageDirectionKey),
    };
  },
  data() {
    return {
      columnWidths: new ReportColumnWidths(this.report.reportName),
      columnHeaders: {},
      pageStart: 0,
      pageEnd: 0,
    };
  },
  computed: {
    dataSlice() {
      if (this.report?.usePagination) {
        return this.report.reportData.slice(
          this.getPageRow(this.pageStart),
          this.getPageRow(this.pageEnd)
        );
      }

      return this.report.reportData;
    },
    entryRowIndexes() {
      return this.report.reportData.flatMap((row, index) =>
        row.isEmpty || row.isSummary ? [] : [index]
      );
    },
    hasChevrons() {
      return this.report.foldsFromChevrons;
    },
    listColumns() {
      return this.report.columns.map(
        (column) => `${this.columnWidths.get(column)}px`
      );
    },
  },
  watch: {
    'report.filterMap'(filters, previousFilters) {
      if (!isEqual(filters, previousFilters)) {
        this.$refs.paginator?.setPageNo(1);
      }
    },
    'report.reportName'(name) {
      this.columnWidths = new ReportColumnWidths(name);
    },
  },
  methods: {
    fitColumn(column, index) {
      this.columnWidths.fit(
        column,
        index,
        this.report.reportData,
        this.columnHeaders[column.fieldname].$el,
        this.$refs.list.$el
      );
    },
    /** Where a page starting at this entry starts; the last page keeps the rows after it. */
    getPageRow(entry) {
      return entry
        ? (this.entryRowIndexes[entry] ?? this.report.reportData.length)
        : 0;
    },
    getRowKey(row, index) {
      return `${index}-${row.cells?.[0]?.value ?? ''}`;
    },
    setPageIndices({ start, end }) {
      this.pageStart = start;
      this.pageEnd = end;
    },
    onRowClick(clickedRow, r) {
      if (!clickedRow.isGroup) {
        return;
      }

      r += 1;
      clickedRow.foldedBelow = !clickedRow.foldedBelow;
      const folded = clickedRow.foldedBelow;
      let row = this.dataSlice[r];

      while (row && row.level > clickedRow.level) {
        row.folded = folded;
        r += 1;
        row = this.dataSlice[r];
      }
    },
    getIndentStyle(cell) {
      return cell.indent
        ? { paddingInlineStart: `${cell.indent * 2}rem` }
        : undefined;
    },
    getCellTypeClass(cell, row) {
      const italics = cell.italics ? 'italic' : '';
      if (row.isGroup) {
        return [cell.bold ? 'text-sm-bold' : 'text-sm-semibold', italics];
      }
      if (row.isShaded) {
        return ['text-base-semibold text-ink-gray-9', italics];
      }
      return [cell.bold ? 'text-base-bold' : '', italics];
    },
    getAlignmentClass(cell) {
      if (this.languageDirection === 'rtl') {
        return 'justify-end text-end';
      }

      const alignment =
        cell.align ?? (isNumeric(cell.fieldtype) ? 'right' : 'left');
      if (alignment === 'right') {
        return 'justify-end text-end';
      }
      if (alignment === 'center') {
        return 'justify-center text-center';
      }
      return 'justify-start text-start';
    },
    getCellColorClass(cell, row) {
      const precision =
        this.fyo.singles.SystemSettings?.currency_precision ?? 2;
      return getReportCellColorClass(cell, precision, row.isGroup);
    },
  },
});
</script>
