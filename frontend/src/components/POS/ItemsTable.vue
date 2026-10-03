<template>
  <div class="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-1">
    <FrappeList
      :columns="['minmax(0, 1fr)', '6rem', '5rem', '6.5rem', '1rem']"
      :row-height="40"
      divider="full"
      class="flex min-h-0 flex-1 flex-col list-gap-3 list-row-px-2.5"
    >
      <FrappeListHeader>
        <FrappeListHeaderCell>{{ t`Item` }}</FrappeListHeaderCell>
        <FrappeListHeaderCell>{{ t`Unit` }}</FrappeListHeaderCell>
        <FrappeListHeaderCell class="justify-end">{{ t`Stock` }}</FrappeListHeaderCell>
        <FrappeListHeaderCell class="justify-end">{{ t`Rate` }}</FrappeListHeaderCell>
        <FrappeListHeaderCell />
      </FrappeListHeader>

      <FrappeScrollArea class="min-h-0 flex-1">
        <FrappeListRows :items="items" row-key="name">
          <template #default="{ item: row, value }">
            <FrappeListRow
              :value="value"
              :aria-label="t`Add ${row.name}`"
              @click="$emit('addItem', row)"
            >
              <FrappeListCell>
                <span class="truncate text-base text-ink-gray-9" :title="row.name">
                  {{ row.name }}
                </span>
              </FrappeListCell>
              <FrappeListCell>
                <span class="truncate text-sm text-ink-gray-6">{{ row.unit }}</span>
              </FrappeListCell>
              <FrappeListCell class="justify-end">
                <span
                  class="truncate text-sm tabular-nums"
                  :class="row.availableQty > 0 ? 'text-ink-gray-6' : 'text-ink-red-5'"
                >
                  {{ fyo.format(row.availableQty, 'Float') }}
                </span>
              </FrappeListCell>
              <FrappeListCell class="justify-end">
                <span class="truncate text-base tabular-nums text-ink-gray-8">
                  {{ fyo.format(row.rate, 'Currency') }}
                </span>
              </FrappeListCell>
              <FrappeListCell class="justify-end">
                <span class="lucide-plus size-4 text-ink-gray-5" aria-hidden="true" />
              </FrappeListCell>
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </FrappeScrollArea>
    </FrappeList>
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
import { defineComponent, PropType } from 'vue';
import { POSItem } from './types';

/** Items to add to the cart, as a list. */
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
  },
});
</script>
