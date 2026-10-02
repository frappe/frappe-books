<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto">
    <FrappeList
      v-if="sinvDoc.items?.length"
      :columns="columns.map(({ width }) => width)"
      divider="full"
      class="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-4 border border-outline-gray-1 list-gap-0 [--list-row-padding-x:0px]"
      :class="
        layout === 'Classic' ? 'min-w-[36rem]' : 'min-w-[calc(23rem+2px)]'
      "
    >
      <FrappeListHeader>
        <FrappeListHeaderCell
          v-for="(column, index) in columns"
          :key="index"
          class="px-2"
          :class="column.numeric ? 'justify-end' : ''"
        >
          {{ column.label }}
        </FrappeListHeaderCell>
      </FrappeListHeader>

      <FrappeScrollArea class="min-h-0 flex-1">
        <FrappeListRows :items="sinvDoc.items ?? []" :row-key="getRowKey">
          <template #default="{ item: row, value }">
            <FrappeListRow :value="value" class="hover:bg-surface-gray-1">
              <SelectedItemRow
                :row="row as SalesInvoiceItem"
                :layout="layout"
                :expanded-row="expandedRow"
                @expand="(name?: string) => $emit('expand', name)"
                @select="
                  (row: SalesInvoiceItem, field?: string) =>
                    $emit('select', row, field)
                "
              />
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </FrappeScrollArea>
    </FrappeList>
    <div
      v-else
      class="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span
        class="lucide-shopping-cart mb-1 size-7 text-ink-gray-5"
        aria-hidden="true"
      />
      <p class="text-base-medium text-ink-gray-8">
        {{ t`No items in this sale` }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{ t`Search or scan an item to get started.` }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { ScrollArea as FrappeScrollArea } from 'frappe-ui';
import {
  List as FrappeList,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { t } from 'fyo';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import { defineComponent, inject, PropType } from 'vue';
import SelectedItemRow from './SelectedItemRow.vue';
import { POSLayout } from './types';

type Column = { label: string; width: string; numeric?: boolean };

/** The cart; Classic adds quantity steppers and a unit column. */
export default defineComponent({
  name: 'SelectedItemTable',
  components: {
    FrappeList,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
    FrappeScrollArea,
    SelectedItemRow,
  },
  props: {
    layout: { type: String as PropType<POSLayout>, required: true },
    expandedRow: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
  },
  emits: ['select', 'expand'],
  setup() {
    return { sinvDoc: inject('sinvDoc') as SalesInvoice };
  },
  computed: {
    columns(): Column[] {
      if (this.layout === 'Classic') {
        return [
          { label: '', width: '2.5rem' },
          { label: t`Item`, width: 'minmax(6rem, 1.4fr)' },
          { label: t`Quantity`, width: 'minmax(5rem, 0.9fr)', numeric: true },
          { label: t`Unit Type`, width: 'minmax(3rem, 0.7fr)' },
          { label: t`Rate`, width: 'minmax(4rem, 0.9fr)', numeric: true },
          { label: t`Amount`, width: 'minmax(4rem, 0.9fr)', numeric: true },
          { label: '', width: '2.5rem' },
        ];
      }

      return [
        { label: '', width: '2.5rem' },
        { label: t`Item`, width: 'minmax(5rem, 1fr)' },
        { label: t`Qty`, width: '3.5rem', numeric: true },
        { label: t`Rate`, width: 'minmax(4.5rem, 0.8fr)', numeric: true },
        { label: t`Amount`, width: 'minmax(5rem, 0.8fr)', numeric: true },
        { label: '', width: '2.5rem' },
      ];
    },
  },
  methods: {
    getRowKey(row: SalesInvoiceItem): string {
      return String(row.name ?? row.idx ?? row.item ?? '');
    },
  },
});
</script>
