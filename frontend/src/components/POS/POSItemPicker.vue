<template>
  <div class="flex shrink-0 flex-wrap gap-2">
    <MultiLabelLink
      class="min-w-0 flex-1 basis-48"
      secondary-link="barcode"
      third-link="itemCode"
      :option-records="searchItems"
      :df="{
        label: t`Search Item (Name, Code, or Barcode)`,
        fieldtype: 'Link',
        fieldname: 'item',
        target: 'Item',
      }"
      :border="true"
      :value="searchTerm"
      :show-clear-button="true"
      :close-on-enter="true"
      @search="(query: string) => $emit('search', query)"
      @enter="(value: string) => $emit('search', value, true)"
      @change="(item: string) => $emit('search', item)"
    />

    <Link
      v-if="fyo.singles.AccountingSettings?.enableitem_group"
      class="w-40 min-w-0"
      :df="{
        label: t`Filter by Group`,
        fieldtype: 'Link',
        fieldname: 'itemGroup',
        target: 'ItemGroup',
      }"
      :border="true"
      :show-clear-button="true"
      :value="itemGroup"
      @change="(group: string) => $emit('setItemGroup', group)"
    />
  </div>

  <div
    v-if="!items.length"
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 text-center"
  >
    <p class="text-lg-medium text-ink-gray-7">
      {{ t`No items found` }}
    </p>
    <p class="text-sm text-ink-gray-5">
      {{ t`Try another search or item group.` }}
    </p>
  </div>

  <ItemsTable
    v-else-if="tableView"
    :items="items"
    :split="split"
    @add-item="(item: POSItem) => $emit('addItem', item)"
  />

  <ItemsGrid
    v-else
    :items="items"
    @add-item="(item: POSItem) => $emit('addItem', item)"
  />
</template>

<script lang="ts">
import Link from 'src/components/Controls/Link.vue';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import { defineComponent, PropType } from 'vue';
import ItemsGrid from './ItemsGrid.vue';
import ItemsTable from './ItemsTable.vue';
import { POSItem } from './types';

/** Item search, group filter and the item list or grid. */
export default defineComponent({
  name: 'POSItemPicker',
  components: { Link, MultiLabelLink, ItemsGrid, ItemsTable },
  props: {
    items: { type: Array as PropType<POSItem[]>, required: true },
    searchItems: { type: Array as PropType<POSItem[]>, required: true },
    searchTerm: { type: String, default: '' },
    itemGroup: { type: String, default: '' },
    tableView: Boolean,
    split: Boolean,
  },
  emits: ['search', 'setItemGroup', 'addItem'],
});
</script>
