<template>
  <div class="flex items-center truncate" :class="cellClass">
    <FrappeBadge v-if="badge" :theme="badge.theme">{{
      badge.label
    }}</FrappeBadge>
    <span v-else class="truncate">{{ columnValue }}</span>
  </div>
</template>
<script lang="ts">
import { Badge as FrappeBadge } from 'frappe-ui';
import { BadgeData, ColumnConfig, RenderData } from 'fyo/model/types';
import { Field } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { defineComponent, PropType } from 'vue';

type Column = ColumnConfig | Field;

function isField(column: ColumnConfig | Field): column is Field {
  if ((column as ColumnConfig).display || (column as ColumnConfig).badge) {
    return false;
  }

  return true;
}

export default defineComponent({
  name: 'ListCell',
  components: { FrappeBadge },
  props: {
    row: { type: Object as PropType<RenderData>, required: true },
    column: { type: Object as PropType<Column>, required: true },
  },
  computed: {
    columnValue(): string {
      const column = this.column;
      const value = this.row[this.column.fieldname];

      if (isField(column)) {
        return fyo.format(value, column);
      }

      return column.display?.(value, fyo) ?? '';
    },
    badge(): BadgeData | undefined {
      return (this.column as ColumnConfig).badge?.(this.row);
    },
    cellClass() {
      return isNumeric(this.column.fieldtype) ? 'justify-end' : '';
    },
  },
});
</script>
