<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto">
    <FrappeList
      v-if="sinvDoc.items?.length"
      :columns="listColumns"
      divider="full"
      class="mt-2 flex min-h-0 min-w-[36rem] flex-1 flex-col overflow-hidden rounded-4 border border-outline-gray-1 list-gap-0 [--list-row-padding-x:0px]"
    >
      <FrappeListHeader>
        <FrappeListHeaderCell
          v-for="df in tableFields"
          :key="df.fieldname"
          class="px-2"
          :class="isNumeric(df) ? 'justify-end' : ''"
        >
          {{ df.label }}
        </FrappeListHeaderCell>
      </FrappeListHeader>

      <div
        class="custom-scroll custom-scroll-thumb1 min-h-0 flex-1 overflow-auto"
      >
        <FrappeListRows :items="sinvDoc.items ?? []" :row-key="getRowKey">
          <template #default="{ item: row, value }">
            <FrappeListRow
              :value="value"
              class="group hover:bg-surface-gray-1"
            >
              <SelectedItemRow
                :row="row as SalesInvoiceItem"
                :expanded-batch-id="expandedBatchId"
                @set-expanded-batch-id="
                  (rowName) => $emit('setExpandedBatchId', rowName)
                "
                @run-sinv-formulas="runSinvFormulas"
                @selected-row="selectedItemRow"
              />
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </div>
    </FrappeList>
    <div
      v-else
      class="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span
        class="lucide-shopping-cart mb-1 size-7 text-ink-gray-5"
        aria-hidden="true"
      />
      <p class="text-base font-medium text-ink-gray-8">
        {{ t`No items in this sale` }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{ t`Search or scan an item to get started.` }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import {
  List as FrappeList,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import SelectedItemRow from './SelectedItemRow.vue';
import { t } from 'fyo';
import { isNumeric } from 'src/utils';
import { inject } from 'vue';
import { defineComponent, PropType } from 'vue';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { Field } from 'schemas/types';

export default defineComponent({
  name: 'SelectedItemTable',
  components: {
    FrappeList,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
    SelectedItemRow,
  },
  setup() {
    return {
      sinvDoc: inject('sinvDoc') as SalesInvoice,
    };
  },
  props: {
    expandedBatchId: {
      type: String as PropType<string | null | undefined>,
      default: undefined,
    },
  },
  emits: ['selectedRow', 'setExpandedBatchId'],
  computed: {
    listColumns(): string[] {
      return [
        '2.5rem',
        'minmax(6rem, 1.4fr)',
        'minmax(5rem, 0.9fr)',
        'minmax(3rem, 0.7fr)',
        'minmax(4rem, 0.9fr)',
        'minmax(4rem, 0.9fr)',
        '2.5rem',
      ];
    },
    tableFields(): Field[] {
      return [
        {
          fieldname: 'toggler',
          fieldtype: 'Link',
          label: ' ',
        },
        {
          fieldname: 'item',
          fieldtype: 'Link',
          label: t`Item`,
          placeholder: 'Item',
          required: true,
          schemaName: 'Item',
        },
        {
          fieldname: 'quantity',
          label: t`Quantity`,
          placeholder: 'Quantity',
          fieldtype: 'Float',
          required: true,
          schemaName: '',
        },
        {
          fieldname: 'unit',
          label: t`Unit Type`,
          placeholder: 'Unit',
          fieldtype: 'Link',
          required: true,
          schemaName: 'UOM',
        },
        {
          fieldname: 'rate',
          label: t`Rate`,
          placeholder: 'Rate',
          fieldtype: 'Currency',
          required: true,
          schemaName: '',
        },
        {
          fieldname: 'amount',
          label: t`Amount`,
          placeholder: 'Amount',
          fieldtype: 'Currency',
          required: true,
          schemaName: '',
        },
        {
          fieldname: 'removeItem',
          fieldtype: 'Link',
          label: ' ',
        },
      ] as Field[];
    },
  },
  methods: {
    getRowKey(row: SalesInvoiceItem): string {
      return String(row.name ?? row.idx ?? row.item ?? '');
    },
    async runSinvFormulas() {
      await this.sinvDoc.runFormulas();
    },
    selectedItemRow(row: SalesInvoiceItem) {
      this.$emit('selectedRow', row);
    },
    isNumeric,
  },
});
</script>
