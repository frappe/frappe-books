<template>
  <!-- A scrolling tree scrolls both ways itself, so its header still sticks. -->
  <component
    :is="scroll ? FrappeScrollArea : 'div'"
    v-bind="scroll ? { orientation: 'both', class: 'min-h-0 flex-1' } : {}"
  >
    <div
      class="grid gap-x-6"
      :class="{ 'w-max min-w-full pb-12': scroll }"
      :style="{ gridTemplateColumns }"
    >
      <div
        class="sticky top-0 z-10 col-span-full grid grid-cols-subgrid border-y border-outline-gray-1 bg-surface-base px-4 py-2 text-xs-medium text-ink-gray-5"
      >
        <span class="truncate">{{ labelHeader }}</span>
        <span
          v-for="value in values"
          :key="value.key"
          class="truncate text-end"
        >
          {{ value.label }}
        </span>
      </div>

      <button
        v-for="row in visibleRows"
        :key="row.key"
        type="button"
        data-testid="report-row"
        class="col-span-full grid grid-cols-subgrid items-center border-b border-outline-gray-1 px-4 text-start tabular-nums enabled:active:bg-surface-gray-2"
        :class="getRowClass(row)"
        :aria-expanded="row.isGroup ? !isCollapsed(row) : undefined"
        :disabled="!row.isGroup && !row.source"
        @click="onClick(row)"
      >
        <span
          class="flex min-w-0 items-center gap-1.5"
          :style="{ paddingInlineStart: `${getIndent(row)}px` }"
        >
          <FrappeIcon
            v-if="row.isGroup"
            :icon="
              isCollapsed(row) ? 'lucide-chevron-right' : 'lucide-chevron-down'
            "
            class="size-4 shrink-0 text-ink-gray-5"
            :class="{ 'rtl-rotate-180': isCollapsed(row) }"
          />
          <FrappeIcon
            v-else-if="row.isChild && icon"
            :icon="icon"
            class="size-3.5 shrink-0 text-ink-gray-5"
          />
          <span class="flex min-w-0 flex-col gap-1">
            <span class="break-words">{{ row.label }}</span>
            <span v-if="row.subtitle" class="truncate text-sm text-ink-gray-5">
              {{ row.subtitle }}
            </span>
          </span>
        </span>
        <span
          v-for="(value, index) in row.values"
          :key="index"
          class="whitespace-nowrap text-end"
          :class="{ 'text-ink-gray-4': value.isZero }"
        >
          <span dir="ltr">{{ value.text }}</span>
        </span>
      </button>
    </div>
  </component>
</template>
<script setup lang="ts">
import { Icon as FrappeIcon, ScrollArea as FrappeScrollArea } from 'frappe-ui';
import type { ReportRow } from 'reports/types';
import { computed, ref } from 'vue';
import {
  getVisibleRows,
  type MobileTreeRow,
  type MobileValueColumn,
} from './MobileTree';

const props = defineProps<{
  rows: MobileTreeRow[];
  values: MobileValueColumn[];
  labelHeader: string;
  /** Rows grouped on the client: groups start collapsed. */
  grouped?: boolean;
  icon?: string;
  /** Labels keep one line and the tree scrolls sideways. */
  scroll?: boolean;
}>();

const emit = defineEmits<{ open: [row: ReportRow] }>();

const toggled = ref(new Set<string>());

/** Long labels wrap, unless the tree scrolls sideways. */
const gridTemplateColumns = computed(() =>
  [
    props.scroll ? 'minmax(max-content, 1fr)' : 'minmax(0, 1fr)',
    ...props.values.map(({ width }) => `minmax(${width}px, max-content)`),
  ].join(' ')
);

const visibleRows = computed(() => getVisibleRows(props.rows, isCollapsed));

function isCollapsed(row: MobileTreeRow) {
  return props.grouped !== toggled.value.has(row.key);
}

function onClick(row: MobileTreeRow) {
  if (!row.isGroup) {
    if (row.source) emit('open', row.source);
    return;
  }

  const next = new Set(toggled.value);
  if (!next.delete(row.key)) next.add(row.key);
  toggled.value = next;
}

/** Leaves line up with the names of the groups above them. */
function getIndent(row: MobileTreeRow) {
  if (row.isChild || row.isTotal) {
    return 0;
  }

  return row.depth * 16 + (row.isGroup ? 0 : 22);
}

function getRowClass(row: MobileTreeRow) {
  if (row.isTotal) {
    const background = props.grouped ? '' : 'bg-surface-gray-1';
    return `min-h-13 text-md-semibold text-ink-gray-8 ${background}`;
  }

  if (row.isGroup) {
    return row.subtitle
      ? 'min-h-15 py-2.5 text-md-medium text-ink-gray-8'
      : 'min-h-12 py-1.5 text-md-semibold text-ink-gray-8';
  }

  const background = row.isChild ? 'bg-surface-gray-1' : '';
  return `min-h-11 py-1.5 text-base text-ink-gray-7 ${background}`;
}
</script>
