<template>
  <div class="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-1">
    <FrappeList
      :columns="['minmax(0, 1fr)', '6rem', '7rem', '6.5rem', '1rem']"
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
                <span class="truncate text-base text-ink-gray-8" :title="row.name">
                  {{ row.name }}
                </span>
              </FrappeListCell>
              <FrappeListCell>
                <span class="truncate text-sm text-ink-gray-6">{{ row.unit }}</span>
              </FrappeListCell>
              <FrappeListCell class="justify-end">
                <FrappeBadge
                  :theme="row.availableQty > 0 ? 'green' : 'red'"
                  :label="t`${row.availableQty} in stock`"
                />
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
import {
  Badge as FrappeBadge,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
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
    FrappeBadge,
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
