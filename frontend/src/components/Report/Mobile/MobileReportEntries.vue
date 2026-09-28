<template>
  <div>
    <template v-for="section in sections" :key="section.key">
      <div v-if="section.date">
        <div
          class="sticky top-0 z-[1] border-y border-outline-gray-1 bg-surface-gray-1 px-4 py-2 text-xs-medium text-ink-gray-6"
        >
          {{ section.date }}
        </div>
        <button
          v-for="entry in section.entries"
          :key="entry.key"
          type="button"
          data-testid="report-row"
          class="flex min-h-16 w-full flex-col justify-center gap-1.5 border-b border-outline-gray-1 px-4 py-2.5 text-start active:bg-surface-gray-1"
          @click="emit('open', entry.source)"
        >
          <span
            class="flex w-full items-baseline gap-3 text-md-medium text-ink-gray-9"
          >
            <span class="min-w-0 flex-1 truncate">{{ entry.title }}</span>
            <span class="tabular-nums" dir="ltr">{{ entry.amount }}</span>
          </span>
          <span class="flex w-full items-center gap-3 text-sm text-ink-gray-5">
            <span class="min-w-0 flex-1 truncate">{{ entry.meta }}</span>
            <span class="whitespace-nowrap tabular-nums">
              {{ t`Balance` }} <span dir="ltr">{{ entry.balance }}</span>
            </span>
          </span>
        </button>
      </div>
      <button
        v-else
        type="button"
        data-testid="report-row"
        class="flex min-h-[52px] w-full items-center gap-3 border-b border-outline-gray-1 bg-surface-gray-1 px-4 text-start text-md-semibold text-ink-gray-9 active:bg-surface-gray-2"
        @click="emit('open', section.entries[0].source)"
      >
        <span class="min-w-0 flex-1 truncate">
          {{ section.entries[0].title }}
        </span>
        <span class="tabular-nums" dir="ltr">
          {{ section.entries[0].balance }}
        </span>
      </button>
    </template>

    <div v-if="hasMore" class="flex justify-center px-4 pt-4">
      <FrappeButton
        size="lg"
        :label="t`Load more`"
        @click="limit += pageSize"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { isEqual } from 'lodash';
import type { ReportRow } from 'reports/types';
import { computed, ref, watch } from 'vue';
import type { MobileEntries } from './MobileEntries';

const pageSize = 50;

const props = defineProps<{ entries: MobileEntries }>();
const emit = defineEmits<{ open: [row: ReportRow] }>();

const limit = ref(pageSize);
const sections = computed(() => props.entries.getSections(limit.value));
const hasMore = computed(() => props.entries.rows.length > limit.value);

// A refresh keeps the loaded pages; new filters start from the top.
watch(
  () => props.entries.report.filterMap,
  (filters, previous) => {
    if (!isEqual(filters, previous)) limit.value = pageSize;
  }
);
</script>
