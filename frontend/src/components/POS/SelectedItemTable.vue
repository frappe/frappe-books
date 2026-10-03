<template>
  <FrappeScrollArea v-if="sinvDoc.items?.length" class="min-h-0 flex-1">
    <FrappeList
      :columns="['minmax(0, 1fr)', 'auto', '5.25rem', '1.5rem']"
      divider="full"
      class="list-gap-2.5 list-row-px-4"
      :aria-label="t`Cart`"
    >
      <FrappeListRows :items="sinvDoc.items ?? []" :row-key="getRowKey">
        <template #default="{ item: row, value }">
          <FrappeListRow
            :value="value"
            class="py-2.5"
            :class="{ 'bg-surface-gray-1': row.name && row.name === expandedRow }"
          >
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
    </FrappeList>
  </FrappeScrollArea>
  <EmptyState
    v-else
    class="min-h-32 flex-1 py-6"
    icon="lucide-shopping-cart"
    :title="t`No items yet`"
    :description="t`Scan a barcode or pick an item to get started.`"
  />
</template>

<script lang="ts">
import { ScrollArea as FrappeScrollArea } from 'frappe-ui';
import {
  List as FrappeList,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import EmptyState from 'src/components/EmptyState.vue';
import { defineComponent, inject, PropType } from 'vue';
import SelectedItemRow from './SelectedItemRow.vue';
import { POSLayout } from './types';

/** The cart's rows, or what to do when it is empty. */
export default defineComponent({
  name: 'SelectedItemTable',
  components: {
    EmptyState,
    FrappeList,
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
  methods: {
    getRowKey(row: SalesInvoiceItem): string {
      return String(row.name ?? row.idx ?? row.item ?? '');
    },
  },
});
</script>
