<template>
  <div class="flex flex-col" :class="isMobile ? 'min-h-full' : ''">
    <PageHeader :title="title">
      <template #mobile>
        <FrappeButton
          v-if="canCreate"
          variant="ghost"
          size="md"
          icon="lucide-plus"
          :label="t`Create new entry`"
          @click="handleMakeNewDoc"
        />
      </template>
      <FrappeButton
        v-if="
          schemaName === 'Item' &&
          (!isSelectionMode || (isSelectionMode && selectedItems.length === 0))
        "
        @click="toggleSelectionMode"
      >
        {{ t`Select` }}
      </FrappeButton>
      <FrappeDropdown
        v-if="isSelectionMode && schemaName === 'Item' && selectedItems.length > 0"
        :options="actionOptions"
        align="end"
      >
        <template #trigger>
          <FrappeButton class="w-40">{{ t`Create` }}</FrappeButton>
        </template>
      </FrappeDropdown>
      <FrappeButton
        v-if="canExport"
        ref="exportButton"
        @click="openExportModal = true"
      >
        {{ t`Export` }}
      </FrappeButton>
      <FilterDropdown ref="filterDropdown" :schema-name="schemaName" @change="applyFilter" />
      <FrappeButton
        v-if="canCreate"
        variant="solid"
        icon="lucide-plus"
        :label="t`Create new entry`"
        :tooltip="t`Create new entry`"
        @click="handleMakeNewDoc"
      />
    </PageHeader>
    <List
      ref="list"
      :schema-name="schemaName"
      :list-config="listConfig"
      :filters="filters"
      :can-create="canCreate"
      :is-selection-mode="isSelectionMode"
      class="flex-1 flex h-full"
      @open-doc="openDoc"
      @updated-data="updatedData"
      @make-new-doc="makeNewDoc"
      @selected-items-changed="updateSelectedItems"
    />
    <ExportWizard
      v-model:open="openExportModal"
      :schema-name="schemaName"
      :page-title="pageTitle"
      :list-filters="listFilters"
    />
  </div>
</template>
<script lang="ts">
import { Field } from 'schemas/types';
import {
  Button as FrappeButton,
  Dropdown as FrappeDropdown,
  type DropdownOptions,
} from 'frappe-ui';
import ExportWizard from 'src/components/ExportWizard.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import PageHeader from 'src/components/PageHeader.vue';

import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap, getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { getFormRoute, openNewDoc, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { QueryFilter } from 'utils/db/types';
import { defineComponent, inject, ref } from 'vue';
import List from './List.vue';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';

export default defineComponent({
  name: 'ListView',
  components: {
    PageHeader,
    List,
    FilterDropdown,
    FrappeButton,
    ExportWizard,
    FrappeDropdown,
  },
  props: {
    schemaName: { type: String, required: true },
    filters: { type: Object, default: undefined },
    pageTitle: { type: String, default: '' },
  },
  setup() {
    return {
      isMobile,
      shortcuts: inject(shortcutsKey),
      list: ref<InstanceType<typeof List> | null>(null),
      exportButton: ref<InstanceType<typeof FrappeButton> | null>(null),
      filterDropdown: ref<InstanceType<typeof FilterDropdown> | null>(null),
    };
  },
  data() {
    return {
      listConfig: undefined,
      openExportModal: false,
      listFilters: {},
      isSelectionMode: false,
      selectedItems: [] as string[],
    } as {
      listConfig: undefined | ReturnType<typeof getListConfig>;
      openExportModal: boolean;
      listFilters: QueryFilter;
      isSelectionMode: boolean;
      selectedItems: string[];
    };
  },
  computed: {
    context(): string {
      return 'ListView-' + this.schemaName;
    },
    title(): string {
      if (this.pageTitle) {
        return this.pageTitle;
      }

      return fyo.schemaMap[this.schemaName]?.label ?? this.schemaName;
    },
    fields(): Field[] {
      return fyo.schemaMap[this.schemaName]?.fields ?? [];
    },
    canExport(): boolean {
      return fyo.can(this.schemaName, 'export');
    },
    canCreate(): boolean {
      return (
        fyo.schemaMap[this.schemaName]?.create !== false &&
        fyo.can(this.schemaName, 'create')
      );
    },
    actionOptions(): DropdownOptions {
      return [
        { value: 'SalesQuote', label: 'Sales Quote' },
        { value: 'SalesInvoice', label: 'Sales Invoice' },
        { value: 'PurchaseInvoice', label: 'Purchase Invoice' },
      ].map((option) => ({
        ...option,
        onClick: () => this.createInvoice(option.value),
      }));
    },
  },
  activated() {
    this.listConfig = getListConfig(this.schemaName);
    docsPathRef.value = docsPathMap[this.schemaName] ?? docsPathMap.Entries ?? '';

    this.setShortcuts();
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.context);
  },
  methods: {
    setShortcuts() {
      if (!this.shortcuts) {
        return;
      }

      this.shortcuts.pmod.set(this.context, ['KeyN'], () => this.makeNewDoc());
      this.shortcuts.pmod.set(this.context, ['KeyE'], () => this.exportButton?.$el.click());
    },
    updatedData(listFilters: QueryFilter) {
      this.listFilters = listFilters;
    },
    async openDoc(name: string) {
      const route = getFormRoute(this.schemaName, name);
      await routeTo(route);
    },
    async makeNewDoc() {
      if (!this.canCreate) {
        return;
      }

      const filters = getCreateFiltersFromListViewFilters(this.filters ?? {});
      await openNewDoc(this.schemaName, filters);
    },
    async handleMakeNewDoc() {
      await this.makeNewDoc();
    },
    applyFilter(filters: QueryFilter) {
      this.list?.updateData(filters);
    },
    toggleSelectionMode() {
      this.isSelectionMode = !this.isSelectionMode;
      if (!this.isSelectionMode) {
        this.selectedItems = [];
      }
    },
    async createInvoice(value: string) {
      if (
        value === ModelNameEnum.SalesQuote ||
        value === ModelNameEnum.SalesInvoice ||
        value === ModelNameEnum.PurchaseInvoice
      ) {
        const doc = fyo.doc.getNewDoc(value);

        for (const itemName of this.selectedItems) {
          const itemDoc = await fyo.doc.getDoc('Item', itemName);

          const itemRow = {
            item: itemName,
            rate: (itemDoc.rate as Money) || fyo.pesa(0),
            quantity: 1,
            transferQuantity: 1,
          };

          await doc.append('items', itemRow);
        }

        const route = getFormRoute(value, doc.name!);
        await routeTo(route);
        this.selectedItems = [];
        this.isSelectionMode = false;
      }
    },

    updateSelectedItems(selected: string[]) {
      this.selectedItems = selected;
    },
  },
});

function getListConfig(schemaName: string) {
  const listConfig = fyo.models[schemaName]?.getListViewSettings?.(fyo);
  if (listConfig?.columns === undefined) {
    return {
      columns: ['name'],
    };
  }
  return listConfig;
}
</script>
