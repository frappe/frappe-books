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
  <div
    v-else
    class="flex min-h-32 flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center"
  >
    <span
      class="flex size-11 items-center justify-center rounded-full bg-surface-gray-2"
    >
      <span class="lucide-shopping-cart size-5 text-ink-gray-5" aria-hidden="true" />
    </span>
    <p class="text-lg-medium text-ink-gray-8">{{ t`No items yet` }}</p>
    <p class="max-w-60 text-sm text-ink-gray-5">
      {{ t`Scan a barcode or pick an item to get started.` }}
    </p>
  </div>
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
import { defineComponent, inject, PropType } from 'vue';
import SelectedItemRow from './SelectedItemRow.vue';
import { POSLayout } from './types';

/** The cart's rows, or what to do when it is empty. */
export default defineComponent({
  name: 'SelectedItemTable',
  components: {
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
