<template>
  <div
    class="min-w-0"
    :class="
      flush ? '' : 'overflow-hidden rounded-5 border border-outline-gray-2'
    "
  >
    <component
      :is="canEdit ? 'button' : 'div'"
      v-for="{ row, title, meta, amount } of summaries"
      :key="row.name"
      class="flex min-h-[52px] w-full items-center gap-3 text-start"
      :class="[
        flush
          ? 'border-t border-outline-gray-1 px-4 py-2.5'
          : 'border-b border-outline-gray-1 px-3 py-2',
        canEdit ? 'active:bg-surface-gray-1' : '',
      ]"
      @click="canEdit && $emit('edit', row)"
    >
      <span class="flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="truncate text-md-medium text-ink-gray-9">
          {{ title || t`Row ${(row.idx ?? 0) + 1}` }}
        </span>
        <span v-if="meta" class="truncate text-sm tabular-nums text-ink-gray-5">
          {{ meta }}
        </span>
      </span>
      <span
        v-if="amount"
        class="text-md-medium tabular-nums text-ink-gray-9"
        dir="ltr"
      >
        {{ amount }}
      </span>
      <span
        v-if="canEdit"
        class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4 rtl-rotate-180"
        aria-hidden="true"
      />
    </component>
    <button
      v-if="canAdd"
      class="flex w-full items-center gap-2 text-md-medium text-ink-gray-8 active:bg-surface-gray-1"
      :class="flush ? 'h-12 border-t border-outline-gray-1 px-4' : 'h-11 px-3'"
      @click="$emit('add')"
    >
      <span class="lucide-plus size-[18px]" aria-hidden="true" />
      {{ t`Add Row` }}
    </button>
  </div>
</template>
<script setup lang="ts">
import { Doc } from 'fyo/model/doc';
import { Field } from 'schemas/types';
import { computed } from 'vue';
import { getRowSummary } from './rowSummary';

const props = defineProps<{
  rows: Doc[];
  fields: Field[];
  canEdit: boolean;
  canAdd: boolean;
  flush?: boolean;
}>();

defineEmits<{ edit: [row: Doc]; add: [] }>();

const summaries = computed(() =>
  props.rows.map((row) => ({ row, ...getRowSummary(row, props.fields) }))
);
</script>
