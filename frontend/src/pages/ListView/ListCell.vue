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
import { isNumeric } from 'src/utils';
import { defineComponent, PropType } from 'vue';
import { formatColumnValue, type ListColumn } from './listColumns';

export default defineComponent({
  name: 'ListCell',
  components: { FrappeBadge },
  props: {
    row: { type: Object as PropType<RenderData>, required: true },
    column: { type: Object as PropType<ListColumn>, required: true },
  },
  computed: {
    columnValue(): string {
      return formatColumnValue(this.row, this.column);
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
