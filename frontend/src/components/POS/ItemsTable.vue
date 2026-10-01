<template>
  <div
    ref="container"
    class="flex min-h-0 flex-1 gap-2"
    :class="split ? 'pt-2' : 'pt-4'"
  >
    <div
      v-for="(columnItems, columnIndex) in itemColumns"
      :key="columnIndex"
      class="min-h-0 min-w-0 flex-1"
    >
      <FrappeList
        :columns="listColumns"
        :row-height="48"
        divider="full"
        class="flex h-full min-h-0 flex-col overflow-hidden rounded-4 border border-outline-gray-1 list-gap-2 [--list-row-padding-x:0px]"
      >
        <FrappeListHeader>
          <FrappeListHeaderCell
            v-for="df in tableFields"
            :key="df.fieldname"
            class="px-3"
            :class="isNumeric(df as Field) ? 'justify-end' : ''"
          >
            {{ df.label }}
          </FrappeListHeaderCell>
        </FrappeListHeader>

        <FrappeScrollArea class="min-h-0 flex-1">
          <FrappeListRows :items="columnItems" row-key="name">
            <template #default="{ item: row, value }">
              <FrappeListRow
                :value="value"
                class="text-ink-gray-8"
                :aria-label="`Add ${row.name}`"
                @click="handleChange(row)"
              >
                <FrappeListCell
                  v-for="df in tableFields"
                  :key="df.fieldname"
                  class="min-w-0 px-3"
                  :class="isNumeric(df as Field) ? 'justify-end text-end' : ''"
                >
                  <span
                    class="truncate"
                    :title="fyo.format(row[df.fieldname as keyof POSItem], df)"
                  >
                    {{ fyo.format(row[df.fieldname as keyof POSItem], df) }}
                  </span>
                </FrappeListCell>
              </FrappeListRow>
            </template>
          </FrappeListRows>
        </FrappeScrollArea>
      </FrappeList>
    </div>
  </div>
</template>

<script lang="ts">
import { ScrollArea as FrappeScrollArea } from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { isNumeric } from 'src/utils';
import { t } from 'fyo';
import { defineComponent, PropType } from 'vue';
import { Field } from 'schemas/types';
import { POSItem } from './types';

/** Items to add to the cart; `split` shows two lists side by side when wide. */
export default defineComponent({
  name: 'ItemsTable',
  components: {
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
    FrappeScrollArea,
  },
  emits: ['addItem'],
  props: {
    items: { type: Array as PropType<POSItem[]>, required: true },
    split: Boolean,
  },
  data() {
    return {
      isWide: false,
      resizeObserver: undefined as ResizeObserver | undefined,
    };
  },
  mounted() {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.isWide = entry.contentRect.width >= 840;
    });
    this.resizeObserver.observe(this.$refs.container as HTMLElement);
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
  },
  computed: {
    ratio() {
      return [1.6, 0.9, 0.8, 0.7];
    },
    listColumns(): string[] {
      return this.ratio.map((ratio) => `minmax(0, ${ratio}fr)`);
    },
    tableFields(): Field[] {
      return [
        { fieldname: 'name', fieldtype: 'Data', label: t`Item` },
        { fieldname: 'rate', fieldtype: 'Currency', label: t`Rate` },
        { fieldname: 'availableQty', fieldtype: 'Float', label: t`Qty` },
        { fieldname: 'unit', fieldtype: 'Data', label: t`Unit` },
      ];
    },
    itemColumns(): POSItem[][] {
      const items = this.items;
      if (!this.split || !this.isWide || items.length < 2) return [items];
      const midpoint = Math.ceil(items.length / 2);
      return [items.slice(0, midpoint), items.slice(midpoint)];
    },
  },
  methods: {
    handleChange(value: POSItem) {
      this.$emit('addItem', value);
    },
    isNumeric,
  },
});
</script>
