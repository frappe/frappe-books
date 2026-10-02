<template>
  <div
    class="min-w-0 overflow-hidden rounded-6 border border-outline-gray-2 bg-surface-base"
  >
    <div
      class="flex items-center gap-2 border-b border-outline-gray-2 bg-surface-gray-1 px-3"
      :class="title ? 'h-10' : 'h-9'"
    >
      <FrappeIcon
        icon="lucide-table-2"
        class="shrink-0 text-ink-gray-5"
        :class="title ? 'size-4' : 'size-3.5'"
      />
      <h2
        v-if="title"
        class="min-w-0 flex-1 truncate text-lg-semibold text-ink-gray-8"
      >
        {{ title }}
      </h2>
      <span class="text-sm text-ink-gray-5" :class="{ 'flex-1': !title }">
        {{ rowCount }}
      </span>
    </div>
    <FrappeList class="list-gap-2.5 list-row-px-3">
      <FrappeListRow
        v-for="{ row, title: rowTitle, meta, amount } of summaries"
        :key="row.name"
        :class="title ? 'min-h-16 py-2.5' : 'min-h-13 py-2'"
        @click="$emit('edit', row)"
      >
        <FrappeListCell>
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-3 bg-surface-gray-2 text-xs-medium tabular-nums text-ink-gray-6"
          >
            {{ (row.idx ?? 0) + 1 }}
          </span>
        </FrappeListCell>
        <FrappeListCell>
          <div class="min-w-0">
            <div class="truncate text-lg text-ink-gray-8">
              {{ rowTitle || t`Row ${(row.idx ?? 0) + 1}` }}
            </div>
            <div
              v-if="meta"
              class="mt-0.5 truncate text-md tabular-nums text-ink-gray-5"
            >
              {{ meta }}
            </div>
          </div>
        </FrappeListCell>
        <FrappeListCell class="justify-end gap-2.5">
          <span
            v-if="amount"
            class="text-lg-medium tabular-nums text-ink-gray-8"
            dir="ltr"
          >
            {{ amount }}
          </span>
          <span
            class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4 rtl-rotate-180"
            aria-hidden="true"
          />
        </FrappeListCell>
      </FrappeListRow>
    </FrappeList>
    <!-- A 44px row: Button stops at 40px (frappe/frappe-ui#1250). -->
    <button
      v-if="canAdd"
      class="flex h-11 w-full items-center gap-2 border-outline-gray-1 px-3 text-md-medium text-ink-gray-8 active:bg-surface-gray-1"
      :class="{ 'border-t': rows.length }"
      @click="$emit('add')"
    >
      <span class="lucide-plus size-5" aria-hidden="true" />
      {{ t`Add Row` }}
    </button>
  </div>
</template>
<script setup lang="ts">
import { Icon as FrappeIcon } from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import { computed } from 'vue';
import { getRowSummary } from './rowSummary';

/** A child table as a card of rows, numbered like the desktop idx column. */
const props = defineProps<{
  rows: FrappeDoc[];
  fields: Field[];
  canAdd: boolean;
  /** A section's table names itself; a field's table has a label above. */
  title?: string;
}>();

defineEmits<{ edit: [row: FrappeDoc]; add: [] }>();

const summaries = computed(() =>
  props.rows.map((row) => ({ row, ...getRowSummary(row, props.fields) }))
);

const rowCount = computed(() =>
  props.rows.length === 1 ? t`1 row` : t`${props.rows.length} rows`
);
</script>
