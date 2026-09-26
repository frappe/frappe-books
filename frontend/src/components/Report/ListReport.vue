<template>
  <div class="overflow-hidden flex flex-col h-full">
    <FrappeList
      v-if="dataSlice.length"
      :columns="listColumns"
      :row-height="hconst"
      divider="full"
      class="custom-scroll custom-scroll-thumb1 min-h-0 flex-1 overflow-auto px-4 list-gap-0 [--list-row-padding-x:0px]"
    >
      <FrappeListHeader class="sticky top-0 z-10 min-w-max bg-surface-base">
        <ReportColumnHeader
          v-for="(column, index) in report.columns"
          :key="columnWidths.getKey(column)"
          :ref="
            (header) => (columnHeaders[columnWidths.getKey(column)] = header)
          "
          :label="column.label"
          :width="columnWidths.get(column)"
          :direction="languageDirection"
          :class="getAlignmentClass(column)"
          @resize="columnWidths.set(column, $event)"
          @commit="columnWidths.set(column, $event, true)"
          @fit="fitColumn(column, index)"
        />
      </FrappeListHeader>

      <FrappeListRows :items="dataSlice" :row-key="getRowKey">
        <template #default="{ item: row, index, value }">
          <FrappeListRow
            v-if="!row.folded"
            :value="value"
            :on-click="row.isGroup ? () => onRowClick(row, index) : undefined"
            :class="row.isGroup ? 'font-medium' : ''"
          >
            <FrappeListCell
              v-for="(cell, cellIndex) in row.cells"
              :key="`${cellIndex}-${index}-cell`"
              class="min-w-0 px-3 text-base"
              :class="[getCellColorClass(cell), getAlignmentClass(cell)]"
              :style="getCellStyle(cell)"
            >
              <ReportOverflowText :value="cell.value" />
            </FrappeListCell>
          </FrappeListRow>
        </template>
      </FrappeListRows>
    </FrappeList>
    <p v-else class="w-full text-center mt-20 text-ink-gray-8 text-base">
      {{ report.loading ? t`Loading Report...` : t`No Values to be Displayed` }}
    </p>

    <!-- Pagination Footer -->
    <div v-if="report.usePagination" class="mt-auto flex-shrink-0">
      <Paginator
        ref="paginator"
        :item-count="report?.reportData?.length ?? 0"
        class="px-4"
        @index-change="setPageIndices"
      />
    </div>
    <div v-else class="h-4" />
  </div>
</template>
<script>
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
import ReportOverflowText from './ReportOverflowText.vue';

export default defineComponent({
  components: {
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    ReportColumnHeader,
    ReportOverflowText,
    FrappeListRow,
    FrappeListRows,
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
      hconst: 48,
      pageStart: 0,
      pageEnd: 0,
    };
  },
  computed: {
    dataSlice() {
      if (this.report?.usePagination) {
        return this.report.reportData.slice(this.pageStart, this.pageEnd);
      }

      return this.report.reportData;
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
        this.columnHeaders[this.columnWidths.getKey(column)].$el
      );
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
    getCellStyle(cell) {
      const styles = {};

      if (cell.bold) {
        styles['font-weight'] = 'bold';
      }

      if (cell.italics) {
        styles['font-style'] = 'oblique 15deg';
      }

      if (cell.indent) {
        if (this.languageDirection === 'rtl') {
          styles['padding-right'] = `${cell.indent * 2}rem`;
        } else {
          styles['padding-left'] = `${cell.indent * 2}rem`;
        }
      }

      return styles;
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
    getCellColorClass(cell) {
      const precision = this.fyo.singles.SystemSettings?.displayPrecision ?? 2;
      return getReportCellColorClass(cell, precision);
    },
  },
});
</script>
