<template>
  <div>
    <FrappeList class="list-row-px-4" :columns="['minmax(0,1fr)', 'auto']">
      <template v-for="section in sections" :key="section.key">
        <FrappeListGroup v-if="section.date" :label="section.date" sticky>
          <FrappeListRow
            v-for="entry in section.entries"
            :key="entry.key"
            data-testid="report-row"
            class="h-17"
            @click="emit('open', entry.source)"
          >
            <FrappeListCell>
              <div class="min-w-0">
                <div class="truncate text-lg text-ink-gray-8">
                  {{ entry.title }}
                </div>
                <div
                  v-if="entry.meta"
                  class="mt-0.5 truncate text-md text-ink-gray-5"
                >
                  {{ entry.meta }}
                </div>
              </div>
            </FrappeListCell>
            <FrappeListCell class="justify-end">
              <div class="whitespace-nowrap text-end tabular-nums">
                <div class="text-lg-medium text-ink-gray-8">
                  <span dir="ltr">{{ entry.amount }}</span>
                </div>
                <div class="mt-0.5 text-md text-ink-gray-5">
                  {{ t`Balance` }} <span dir="ltr">{{ entry.balance }}</span>
                </div>
              </div>
            </FrappeListCell>
          </FrappeListRow>
        </FrappeListGroup>
        <FrappeListRow
          v-else
          data-testid="report-row"
          class="h-13 bg-surface-gray-1 text-lg-semibold text-ink-gray-8"
          @click="emit('open', section.entries[0].source)"
        >
          <FrappeListCell>
            <span class="truncate">{{ section.entries[0].title }}</span>
          </FrappeListCell>
          <FrappeListCell class="justify-end tabular-nums">
            <span dir="ltr">{{ section.entries[0].balance }}</span>
          </FrappeListCell>
        </FrappeListRow>
      </template>
    </FrappeList>

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
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListGroup as FrappeListGroup,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
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
