<template>
  <div v-if="tableFields?.length && isMobile" class="min-w-0">
    <FrappeFormLabel
      v-if="showLabel"
      class="mb-1.5"
      :label="df.label"
      :required="isRequired"
    />
    <MobileTableRows
      :rows="value"
      :fields="tableFields"
      :can-add="canAddRemoveRows"
      :title="title"
      @edit="(row) => $emit('editrow', row)"
      @add="addRowAndEdit"
    />
  </div>
  <div v-else-if="tableFields?.length" class="min-w-0">
    <FrappeFormLabel
      v-if="showLabel"
      class="mb-1"
      :label="df.label"
      :required="isRequired"
    />

    <div
      class="max-w-full overflow-x-auto"
      :class="border ? 'rounded-4 border border-outline-gray-1' : ''"
    >
      <FrappeList
        :columns="listColumns"
        :row-height="rowHeight"
        divider="full"
        class="list-gap-2 list-row-px-0"
        :style="{ minWidth: minimumWidth }"
      >
        <!-- frappe-ui headers are one fixed line; field descriptions and long labels wrap here. -->
        <FrappeListHeader v-if="showHeader" class="!h-auto min-h-8 py-1">
          <FrappeListHeaderCell class="justify-center">#</FrappeListHeaderCell>
          <FrappeListHeaderCell
            v-for="(df, index) in tableFields"
            :key="df.fieldname"
            class="relative min-w-0 [&>span]:whitespace-normal [&>span]:break-words"
            :class="[
              cellPaddingClass,
              df.sub_label ? 'flex-col justify-center' : 'items-center',
              isNumeric(df)
                ? df.sub_label
                  ? 'items-end text-end'
                  : 'justify-end text-end'
                : df.sub_label
                  ? 'items-center text-center'
                  : '',
            ]"
          >
            <span>{{ df.label }}</span>
            <p v-if="df.sub_label" class="text-xs">
              {{ df.sub_label }}
            </p>
            <!-- A last column fills the row, so it has no edge to drag. -->
            <template
              v-if="canEditRow || index < tableFields.length - 1"
              #suffix
            >
              <ColumnResizeHandle
                :label="df.label"
                :title="
                  t`Drag to resize. Double-click or press Enter to reset. Use arrow keys to resize.`
                "
                :width="columnWidths.widths[df.fieldname]"
                :direction="languageDirection"
                keep-label
                @resize="columnWidths.set(df.fieldname, $event)"
                @commit="columnWidths.set(df.fieldname, $event, true)"
                @fit="columnWidths.set(df.fieldname, undefined, true)"
              />
            </template>
          </FrappeListHeaderCell>
          <FrappeListHeaderCell v-if="canEditRow">
            <span class="sr-only">{{ t`Actions` }}</span>
          </FrappeListHeaderCell>
        </FrappeListHeader>

        <!-- Data Rows -->
        <div
          v-if="value"
          :class="{
            'overflow-x-hidden overflow-y-auto':
              rowsOverflow,
            'overscroll-contain': rowsOverflow,
          }"
          :style="{ 'max-height': maxHeight }"
        >
          <TableRow
            v-for="row of value"
            ref="table-row"
            :key="row.name"
            v-bind="{ row, tableFields, size }"
            :read-only="isReadOnly"
            :can-remove-row="canAddRemoveRows"
            :can-edit-row="canEditRow"
            @remove="removeRow(row)"
            @editrow="(row) => $emit('editrow', row)"
            @change="(field, value) => $emit('row-change', field, value, df)"
          />
        </div>

        <!-- Add Row and Row Count -->
        <FrappeListRow
          v-if="canAddRemoveRows"
          class="border-t border-outline-gray-1 text-ink-gray-5"
          @click="addRow"
        >
          <FrappeListCell class="justify-center">
            <span class="lucide-plus size-4 text-ink-gray-5" aria-hidden="true" />
          </FrappeListCell>
          <FrappeListCell
            class="justify-between px-2"
            style="grid-column: 2 / -1"
          >
            <p>
              {{ t`Add Row` }}
            </p>
            <p
              v-if="
                value &&
                maxRowsBeforeOverflow &&
                value.length > maxRowsBeforeOverflow
              "
              class="text-end px-2"
            >
              {{ t`${value.length} rows` }}
            </p>
          </FrappeListCell>
        </FrappeListRow>
      </FrappeList>
    </div>
  </div>
</template>

<script>
import { FormLabel as FrappeFormLabel } from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import { getFields, getSchema } from 'src/frappe/registry';
import { ColumnWidths } from 'src/utils/columnWidths';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { nextTick } from 'vue';
import ColumnResizeHandle from '../ColumnResizeHandle.vue';
import Base from './Base.vue';
import MobileTableRows from './MobileTableRows.vue';
import TableRow from './TableRow.vue';

export default {
  name: 'Table',
  components: {
    ColumnResizeHandle,
    FrappeFormLabel,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    MobileTableRows,
    TableRow,
  },
  extends: Base,
  inject: {
    languageDirection: { from: languageDirectionKey, default: undefined },
  },
  props: {
    value: { type: Array, default: () => [] },
    showHeader: {
      type: Boolean,
      default: true,
    },
    maxRowsBeforeOverflow: {
      type: Number,
      default: 0,
    },
    border: {
      type: Boolean,
      default: false,
    },
    allowAddRemoveRows: {
      type: Boolean,
      default: true,
    },
    /** Phones: a section's table names itself in its card header. */
    title: {
      type: String,
      default: '',
    },
  },
  emits: ['editrow', 'row-change', 'row-remove'],
  data() {
    return {
      columnWidths: new ColumnWidths(
        `books:table-column-widths:${this.df.target}`
      ),
    };
  },
  computed: {
    rowHeight() {
      return 48;
    },
    canAddRemoveRows() {
      return !this.isReadOnly && this.allowAddRemoveRows;
    },
    canEditRow() {
      return this.df.edit;
    },
    rowsOverflow() {
      return (
        this.maxRowsBeforeOverflow > 0 &&
        this.value.length > this.maxRowsBeforeOverflow
      );
    },
    maxHeight() {
      if (!this.rowsOverflow) {
        return '';
      }

      return `${this.rowHeight * this.maxRowsBeforeOverflow}px`;
    },
    listColumns() {
      return [
        '2rem',
        ...this.tableFields.map((field, index) => {
          const width = this.columnWidths.widths[field.fieldname];
          if (width) return `${width}px`;
          const share = field === this.subjectField ? 2 : 1;
          return `minmax(${this.fieldMinimumWidths[index]}rem, ${share}fr)`;
        }),
        ...(this.canEditRow ? ['2rem'] : []),
      ];
    },
    subjectField() {
      // The row's first link (item, account) names it, so it gets more room.
      return this.tableFields.find((field) => this.isLink(field));
    },
    fieldMinimumWidths() {
      return this.tableFields.map((field) => {
        if (field.fieldtype === 'Check') return 3;
        if (field.fieldtype === 'Int') return 4;
        if (field.fieldtype === 'Currency') return 7;
        if (this.isLink(field)) return 9;
        return this.isNumeric(field) ? 6 : 8;
      });
    },
    minimumWidth() {
      // Keep fields usable in narrow forms; the shared viewport scrolls them.
      let fields = 0;
      let resized = 0;
      this.tableFields.forEach((field, index) => {
        const width = this.columnWidths.widths[field.fieldname];
        if (width) resized += width;
        else fields += this.fieldMinimumWidths[index];
      });
      const actions = this.canEditRow ? 4 : 2;
      const gaps = (this.listColumns.length - 1) * 0.5;
      return `calc(${fields + actions + gaps}rem + ${resized}px)`;
    },
    cellPaddingClass() {
      return this.size === 'small' ? 'px-2' : 'px-3';
    },
    tableFields() {
      const fieldnames = getSchema(this.df.target)?.tableFields ?? [];
      return getFields(this.df.target, fieldnames);
    },
  },
  methods: {
    focus() {},
    isLink(field) {
      return ['Link', 'DynamicLink'].includes(field.fieldtype);
    },
    async addRow() {
      await this.doc.append(this.df.fieldname);
      await nextTick();
      this.scrollToRow(this.value.length - 1);
      this.triggerChange(this.value);
      this.$nextTick(() => {
        const rows = this.$refs['table-row'];
        if (rows && rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          if (lastRow.focusFirstInput) {
            lastRow.focusFirstInput();
          }
        }
      });
    },
    async addRowAndEdit() {
      await this.doc.append(this.df.fieldname);
      const rows = this.doc.get(this.df.fieldname);
      this.triggerChange(rows);
      this.$emit('editrow', rows.at(-1));
    },
    removeRow(row) {
      // Before removal, so listeners update ahead of the next render.
      this.$emit('row-remove', row);
      this.doc.remove(this.df.fieldname, row.idx).then((s) => {
        if (!s) {
          return;
        }
        this.triggerChange(this.value);
      });
    },

    scrollToRow(index) {
      const row = this.$refs['table-row'][index];
      row?.$el.scrollIntoView({ block: 'nearest' });
    },
  },
};
</script>
