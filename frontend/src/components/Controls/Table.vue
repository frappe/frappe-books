<template>
  <div v-if="tableFields?.length" class="min-w-0">
    <FrappeFormLabel
      v-if="showLabel"
      class="mb-1"
      :label="df.label"
      :required="isRequired"
    />

    <div
      class="max-w-full overflow-x-auto custom-scroll custom-scroll-thumb1"
      :class="border ? 'rounded-4 border border-outline-gray-1' : ''"
    >
      <FrappeList
        :columns="listColumns"
        :row-height="rowHeight"
        divider="full"
        class="list-gap-2 [--list-row-padding-x:0px]"
        :style="{ minWidth: minimumWidth }"
      >
        <FrappeListHeader v-if="showHeader" class="!h-auto min-h-8 py-1">
          <FrappeListHeaderCell class="justify-center">#</FrappeListHeaderCell>
          <FrappeListHeaderCell
            v-for="df in tableFields"
            :key="df.fieldname"
            class="min-w-0 [&>span]:whitespace-normal [&>span]:break-words"
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
          </FrappeListHeaderCell>
          <FrappeListHeaderCell v-if="canEditRow">
            <span class="sr-only">{{ t`Actions` }}</span>
          </FrappeListHeaderCell>
        </FrappeListHeader>

        <!-- Data Rows -->
        <div
          v-if="value"
          :class="{
            'overflow-x-hidden overflow-y-auto custom-scroll custom-scroll-thumb1':
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
          class="border-t border-outline-gray-1 text-ink-gray-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
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
import { fyo } from 'src/initFyo';
import { nextTick } from 'vue';
import Base from './Base.vue';
import TableRow from './TableRow.vue';

export default {
  name: 'Table',
  components: {
    FrappeFormLabel,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    TableRow,
  },
  extends: Base,
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
  },
  emits: ['editrow', 'row-change', 'row-remove'],
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
        ...this.fieldMinimumWidths.map((width) => `minmax(${width}rem, 1fr)`),
        ...(this.canEditRow ? ['2rem'] : []),
      ];
    },
    fieldMinimumWidths() {
      return this.tableFields.map((field) => {
        if (field.fieldtype === 'Check') return 3;
        if (field.fieldtype === 'Int') return 4;
        if (['Link', 'DynamicLink'].includes(field.fieldtype)) return 9;
        return this.isNumeric(field) ? 6 : 8;
      });
    },
    minimumWidth() {
      // Keep fields usable in narrow forms; the shared viewport scrolls them.
      const fields = this.fieldMinimumWidths.reduce(
        (sum, width) => sum + width,
        0
      );
      const actions = this.canEditRow ? 4 : 2;
      const gaps = (this.listColumns.length - 1) * 0.5;
      return `${fields + actions + gaps}rem`;
    },
    cellPaddingClass() {
      return this.size === 'small' ? 'px-2' : 'px-3';
    },
    tableFields() {
      const fields = fyo.schemaMap[this.df.target].tableFields ?? [];
      return fields.map((fieldname) => fyo.getField(this.df.target, fieldname));
    },
  },
  methods: {
    focus() {},
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
