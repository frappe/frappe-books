<template>
  <div class="flex shrink-0 flex-col gap-3 px-5 pb-3 pt-4">
    <div class="flex items-center gap-2">
      <MultiLabelLink
        class="min-w-0 flex-1"
        secondary-link="barcode"
        third-link="itemCode"
        :option-records="searchItems"
        :df="{
          label: t`Search by item name, code or barcode`,
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
      <FrappeTabButtons
        :model-value="tableView ? 'list' : 'grid'"
        :options="viewOptions"
        @update:model-value="$emit('toggleView')"
      />
    </div>

    <div v-if="itemGroups.length" class="flex flex-wrap gap-1.5">
      <FrappeButton
        v-for="group in ['', ...itemGroups]"
        :key="group"
        :variant="group === itemGroup ? 'subtle' : 'outline'"
        :label="group || t`All`"
        :aria-pressed="group === itemGroup"
        @click="$emit('setItemGroup', group)"
      />
    </div>
  </div>

  <EmptyState
    v-if="!items.length"
    class="min-h-0 flex-1"
    icon="lucide-search-x"
    :title="t`No items found`"
    :description="t`Try a different name, code or barcode.`"
  />

  <ItemsTable
    v-else-if="tableView"
    :items="items"
    @add-item="(item: POSItem) => $emit('addItem', item)"
  />

  <ItemsGrid
    v-else
    :items="items"
    @add-item="(item: POSItem) => $emit('addItem', item)"
  />
</template>

<script lang="ts">
import { Button as FrappeButton, TabButtons as FrappeTabButtons } from 'frappe-ui';
import { t } from 'fyo';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import EmptyState from 'src/components/EmptyState.vue';
import { getAllDocuments } from 'src/frappe/api';
import { fyo } from 'src/initFyo';
import { defineComponent, PropType } from 'vue';
import ItemsGrid from './ItemsGrid.vue';
import ItemsTable from './ItemsTable.vue';
import { POSItem } from './types';

/** Item search, view toggle, group filter and the item list or grid. */
export default defineComponent({
  name: 'POSItemPicker',
  components: {
    EmptyState,
    FrappeButton,
    FrappeTabButtons,
    MultiLabelLink,
    ItemsGrid,
    ItemsTable,
  },
  props: {
    items: { type: Array as PropType<POSItem[]>, required: true },
    searchItems: { type: Array as PropType<POSItem[]>, required: true },
    searchTerm: { type: String, default: '' },
    itemGroup: { type: String, default: '' },
    tableView: Boolean,
  },
  emits: ['search', 'setItemGroup', 'addItem', 'toggleView'],
  data() {
    return { itemGroups: [] as string[] };
  },
  computed: {
    viewOptions() {
      return [
        { value: 'grid', label: t`Grid view`, icon: 'lucide-layout-grid' },
        { value: 'list', label: t`List view`, icon: 'lucide-list' },
      ];
    },
  },
  async mounted() {
    if (!fyo.singles.AccountingSettings?.enableitem_group) {
      return;
    }

    const groups = await getAllDocuments('Books Item Group', {
      fields: ['name'],
    });
    this.itemGroups = groups.map(({ name }) => name as string);
  },
});
</script>
